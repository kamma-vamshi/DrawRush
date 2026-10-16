/**
 * DrawRush Game Engine — authoritative server-side state machine.
 *
 * All game phase transitions happen here.
 * The io (Socket.IO server) is passed in to emit events.
 * No client can trigger a phase change directly.
 */

import type { Server as SocketServer } from "socket.io";
import { GamePhase } from "../protocol/types.js";
import type { RoundResult, GameResult, ScoreUpdate } from "../protocol/types.js";
import { S2C } from "../protocol/events.js";
import { Room, type ServerPlayer, type RoundInfo } from "../rooms/room.js";
import { roomStore } from "../rooms/roomStore.js";
import { pickWords } from "../words/wordDatabase.js";
import { buildWordPattern, calculateGuessPoints, calculateArtistPoints } from "../utils/helpers.js";
import { calcGuessPoints, calcArtistPoints, clampScore } from "../scoring/scoring.js";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

function roomChannel(roomCode: string) {
  return `room:${roomCode}`;
}

export class GameEngine {
  constructor(private io: SocketServer) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Transition LOBBY → COUNTDOWN → WORD_SELECTION. Called when host starts game. */
  async startGame(room: Room): Promise<void> {
    if (room.phase !== GamePhase.LOBBY) return;
    room.clearAllTimers();
    room.resetForNewGame();
    room.gameStartedAt = Date.now();

    // Build artist rotation queue
    room.artistQueue = room.connectedPlayers.map((p) => p.playerId);
    this.shuffleArray(room.artistQueue);
    room.currentArtistIndex = -1;

    logger.info({ roomCode: room.roomCode, players: room.artistQueue }, "Game starting");

    await this.transitionToCountdown(room);
  }

  /** Called when artist selects a word. */
  async artistSelectWord(room: Room, artistId: string, chosenWord: string): Promise<void> {
    if (room.phase !== GamePhase.WORD_SELECTION) {
      logger.warn({ roomCode: room.roomCode }, "selectWord in wrong phase");
      return;
    }
    const round = room.currentRound;
    if (!round || round.artistId !== artistId) {
      logger.warn({ roomCode: room.roomCode, artistId }, "selectWord from wrong player");
      return;
    }
    // Validate choice is one of the offered choices
    const normalizedChoice = chosenWord.toLowerCase().trim();
    const normalizedChoices = round.wordChoicesForArtist.map((w) => w.toLowerCase().trim());
    if (!normalizedChoices.includes(normalizedChoice)) {
      logger.warn({ roomCode: room.roomCode }, "Invalid word choice");
      return;
    }
    room.clearPhaseTimer();

    const selectedWord = round.wordChoicesForArtist[normalizedChoices.indexOf(normalizedChoice)];
    await this.beginDrawingPhase(room, selectedWord);
  }

  /**
   * Submit a guess from a guesser.
   * Returns { correct, points } if correct, or { correct: false } if wrong.
   */
  async submitGuess(
    room: Room,
    player: ServerPlayer,
    rawGuess: string
  ): Promise<{ correct: boolean; points?: number }> {
    if (room.phase !== GamePhase.DRAWING) return { correct: false };
    const round = room.currentRound;
    if (!round) return { correct: false };
    if (player.playerId === round.artistId) return { correct: false };
    if (player.hasGuessedCurrentWord) return { correct: false };

    const normalizedGuess = rawGuess.toLowerCase().trim().replace(/\s+/g, " ");
    const normalizedAnswer = round.secretWord.toLowerCase().trim();

    if (normalizedGuess !== normalizedAnswer) {
      return { correct: false };
    }

    // Correct guess!
    const now = Date.now();
    const remainingMs = Math.max(0, round.endTimestamp - now);
    const totalMs = round.endTimestamp - round.startTimestamp;
    const points = calcGuessPoints(remainingMs, totalMs);

    player.hasGuessedCurrentWord = true;
    player.score = clampScore(player.score + points);
    player.correctGuessCount++;

    round.correctGuessers.push({ playerId: player.playerId, timeMs: now - round.startTimestamp, points });

    // Broadcast: player guessed correctly (no word reveal)
    const scoreUpdates: ScoreUpdate[] = [
      { playerId: player.playerId, delta: points, newScore: player.score, reason: "correctGuess" },
    ];
    this.io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_GUESSED_CORRECTLY, {
      version: 1,
      roomCode: room.roomCode,
      playerId: player.playerId,
      nickname: player.nickname,
    });
    this.io.to(roomChannel(room.roomCode)).emit(S2C.SCORE_UPDATED, {
      version: 1,
      roomCode: room.roomCode,
      updates: scoreUpdates,
    });

    logger.info({ roomCode: room.roomCode, playerId: player.playerId, points }, "Correct guess");

    // Check if all eligible guessers are done
    const remaining = room.eligibleGuessers;
    if (remaining.length === 0) {
      // All guessed correctly — end round immediately
      await this.endRound(room, "allGuessed");
    }

    return { correct: true, points };
  }

  /** Force end the current round (e.g. artist disconnect, timer). */
  async endRound(room: Room, reason: "timerExpired" | "allGuessed" | "artistDisconnected"): Promise<void> {
    if (room.phase !== GamePhase.DRAWING && room.phase !== GamePhase.WORD_SELECTION) return;
    room.clearAllTimers();

    const round = room.currentRound;
    const answer = round?.secretWord ?? "";

    logger.info({ roomCode: room.roomCode, reason, answer: "[REDACTED]" }, "Round ended");

    // Award artist points
    const artistPlayer = round ? room.players.get(round.artistId) : undefined;
    const scoreUpdates: ScoreUpdate[] = [];
    if (artistPlayer && round) {
      const artistPoints = calcArtistPoints(round.correctGuessers.length);
      if (artistPoints > 0) {
        artistPlayer.score = clampScore(artistPlayer.score + artistPoints);
        scoreUpdates.push({
          playerId: artistPlayer.playerId,
          delta: artistPoints,
          newScore: artistPlayer.score,
          reason: "artistReward",
        });
      }
    }

    const roundResult: RoundResult = {
      roundNumber: room.totalRoundsPlayed + 1,
      answer,
      artistId: round?.artistId ?? "",
      correctGuessers: round?.correctGuessers ?? [],
      artistPoints: round ? calcArtistPoints(round.correctGuessers.length) : 0,
      scores: scoreUpdates,
      reason,
    };

    room.phase = GamePhase.ROUND_RESULT;
    room.totalRoundsPlayed++;

    this.io.to(roomChannel(room.roomCode)).emit(S2C.ROUND_ENDED, {
      version: 1,
      roomCode: room.roomCode,
      result: roundResult,
      players: room.playerList.map((p) => room.getPublicPlayerState(p)),
    });

    if (scoreUpdates.length > 0) {
      this.io.to(roomChannel(room.roomCode)).emit(S2C.SCORE_UPDATED, {
        version: 1,
        roomCode: room.roomCode,
        updates: scoreUpdates,
      });
    }

    // Schedule next round or game end
    room.phaseTimer = setTimeout(async () => {
      if (room.totalRoundsPlayed >= room.settings.rounds * room.connectedPlayers.length) {
        await this.endGame(room);
      } else {
        await this.transitionToNextRound(room);
      }
    }, config.ROUND_RESULT_MS);
  }

  /** Migrate host to next connected player. */
  migrateHost(room: Room): ServerPlayer | null {
    const candidates = room.connectedPlayers.filter((p) => !p.isHost);
    if (candidates.length === 0) return null;
    const newHost = candidates[0];
    // Clear old host
    for (const p of room.players.values()) p.isHost = false;
    newHost.isHost = true;
    logger.info({ roomCode: room.roomCode, newHostId: newHost.playerId }, "Host migrated");
    return newHost;
  }

  // ─── Private phase transitions ────────────────────────────────────────────

  private async transitionToCountdown(room: Room): Promise<void> {
    room.phase = GamePhase.COUNTDOWN;
    const countdownEndTs = Date.now() + config.COUNTDOWN_MS;

    this.io.to(roomChannel(room.roomCode)).emit(S2C.COUNTDOWN_STARTED, {
      version: 1,
      roomCode: room.roomCode,
      endsAt: countdownEndTs,
      serverTime: Date.now(),
    });

    room.phaseTimer = setTimeout(async () => {
      await this.transitionToWordSelection(room);
    }, config.COUNTDOWN_MS);
  }

  private async transitionToWordSelection(room: Room): Promise<void> {
    room.clearAllTimers();
    room.resetForNewRound();

    // Select next artist (round-robin, skip disconnected)
    const artist = this.selectNextArtist(room);
    if (!artist) {
      logger.error({ roomCode: room.roomCode }, "No valid artist found");
      await this.endGame(room);
      return;
    }

    artist.isArtist = true;

    // Pick word choices
    const wordChoices = pickWords(room.settings.wordChoiceCount, {
      categories: room.settings.categories,
      customWords: room.settings.customWords,
      exclusiveCustomWords: room.settings.exclusiveCustomWords,
      usedWords: room.usedWordsThisGame,
    });

    if (wordChoices.length === 0) {
      // Fallback: reset used words and retry
      room.usedWordsThisGame.clear();
      wordChoices.push(...pickWords(room.settings.wordChoiceCount));
    }

    const selectionDeadline = Date.now() + config.WORD_SELECTION_TIMEOUT_MS;

    const round: RoundInfo = {
      roundNumber: room.totalRoundsPlayed + 1,
      artistId: artist.playerId,
      secretWord: "",
      wordPattern: "",
      revealedIndices: new Set(),
      hintCount: room.settings.hintCount,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: 0,
      endTimestamp: 0,
      correctGuessers: [],
      wordChoicesForArtist: wordChoices,
      drawingSequence: 0,
      usedWords: new Set(room.usedWordsThisGame),
    };

    room.currentRound = round;
    room.phase = GamePhase.WORD_SELECTION;

    // Send word choices ONLY to artist
    const artistSocket = this.io.sockets.sockets.get(artist.socketId ?? "");
    if (artistSocket) {
      artistSocket.emit(S2C.WORD_CHOICES, {
        version: 1,
        roomCode: room.roomCode,
        choices: wordChoices,
        deadline: selectionDeadline,
        serverTime: Date.now(),
      });
    }

    // Notify all others (no word info, just phase change and word length info)
    this.io.to(roomChannel(room.roomCode)).emit(S2C.ROOM_UPDATED, {
      version: 1,
      roomCode: room.roomCode,
      phase: GamePhase.WORD_SELECTION,
      currentArtistId: artist.playerId,
      wordLength: null, // not known until word selected
      selectionDeadline,
      serverTime: Date.now(),
      players: room.playerList.map((p) => room.getPublicPlayerState(p)),
    });

    logger.debug({ roomCode: room.roomCode, artistId: artist.playerId }, "Word selection phase");

    // Auto-select if artist doesn't choose in time
    room.phaseTimer = setTimeout(async () => {
      if (room.phase === GamePhase.WORD_SELECTION && room.currentRound?.secretWord === "") {
        const autoWord = wordChoices[Math.floor(Math.random() * wordChoices.length)];
        logger.info({ roomCode: room.roomCode }, "Auto-selecting word for artist");
        await this.beginDrawingPhase(room, autoWord);
      }
    }, config.WORD_SELECTION_TIMEOUT_MS);
  }

  private async beginDrawingPhase(room: Room, selectedWord: string): Promise<void> {
    room.clearPhaseTimer();
    const round = room.currentRound;
    if (!round) return;

    round.secretWord = selectedWord;
    room.usedWordsThisGame.add(selectedWord.toLowerCase());
    round.wordPattern = buildWordPattern(selectedWord, new Set());

    const totalMs = room.settings.drawingTimeSec * 1000;
    const now = Date.now();
    round.startTimestamp = now;
    round.endTimestamp = now + totalMs;

    // Schedule hints
    if (round.hintCount > 0) {
      round.hintIntervalMs = Math.floor(totalMs / (round.hintCount + 1));
      this.scheduleHints(room, round.hintIntervalMs);
    }

    room.phase = GamePhase.DRAWING;
    room.drawingHistory = [];

    // Send word to artist only (they need it to draw)
    const artistSocket = this.io.sockets.sockets.get(room.players.get(round.artistId)?.socketId ?? "");
    if (artistSocket) {
      artistSocket.emit(S2C.DRAWING_STARTED, {
        version: 1,
        roomCode: room.roomCode,
        secretWord: selectedWord,     // ONLY to artist socket
        wordPattern: selectedWord,    // artist sees full word
        wordLength: selectedWord.replace(/ /g, "").length,
        startTimestamp: round.startTimestamp,
        endTimestamp: round.endTimestamp,
        serverTime: Date.now(),
        isArtist: true,
      });
    }

    // Send masked info to all other players
    room.playerList
      .filter((p) => p.playerId !== round.artistId && p.socketId)
      .forEach((p) => {
        const sock = this.io.sockets.sockets.get(p.socketId!);
        if (sock) {
          sock.emit(S2C.DRAWING_STARTED, {
            version: 1,
            roomCode: room.roomCode,
            wordPattern: round.wordPattern,
            wordLength: selectedWord.replace(/ /g, "").length,
            startTimestamp: round.startTimestamp,
            endTimestamp: round.endTimestamp,
            serverTime: Date.now(),
            isArtist: false,
          });
        }
      });

    logger.debug({ roomCode: room.roomCode, wordLength: selectedWord.length }, "Drawing phase started");

    // End drawing phase when timer expires
    room.phaseTimer = setTimeout(async () => {
      if (room.phase === GamePhase.DRAWING) {
        await this.endRound(room, "timerExpired");
      }
    }, totalMs);
  }

  private scheduleHints(room: Room, intervalMs: number): void {
    const round = room.currentRound;
    if (!round) return;

    const scheduleNext = (hintsRemaining: number) => {
      if (hintsRemaining <= 0 || room.phase !== GamePhase.DRAWING) return;
      room.hintTimer = setTimeout(() => {
        if (room.phase !== GamePhase.DRAWING || !room.currentRound) return;
        const newPattern = room.revealNextHint();
        if (newPattern) {
          this.io.to(roomChannel(room.roomCode)).emit(S2C.HINT_UPDATED, {
            version: 1,
            roomCode: room.roomCode,
            wordPattern: newPattern,
            hintsGiven: room.currentRound.hintsGiven,
          });
        }
        scheduleNext(hintsRemaining - 1);
      }, intervalMs);
    };

    scheduleNext(round.hintCount);
  }

  private async transitionToNextRound(room: Room): Promise<void> {
    room.phase = GamePhase.NEXT_ROUND;
    this.io.to(roomChannel(room.roomCode)).emit(S2C.ROOM_UPDATED, {
      version: 1,
      roomCode: room.roomCode,
      phase: GamePhase.NEXT_ROUND,
      serverTime: Date.now(),
    });

    // Brief pause then start word selection for next artist
    room.phaseTimer = setTimeout(async () => {
      await this.transitionToWordSelection(room);
    }, 2000);
  }

  private async endGame(room: Room): Promise<void> {
    room.clearAllTimers();
    room.phase = GamePhase.GAME_RESULT;

    const rankings = room.playerList
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        playerId: p.playerId,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correctGuessCount: p.correctGuessCount,
      }));

    const result: GameResult = { rankings };

    this.io.to(roomChannel(room.roomCode)).emit(S2C.GAME_ENDED, {
      version: 1,
      roomCode: room.roomCode,
      result,
      serverTime: Date.now(),
    });

    logger.info({ roomCode: room.roomCode, winnerId: rankings[0]?.playerId }, "Game ended");

    // Return to lobby state after brief delay
    room.phaseTimer = setTimeout(() => {
      room.phase = GamePhase.LOBBY;
      for (const p of room.players.values()) {
        p.ready = false;
        p.isArtist = false;
      }
    }, 10000);
  }

  private selectNextArtist(room: Room): ServerPlayer | null {
    const connected = new Set(room.connectedPlayers.map((p) => p.playerId));
    let attempts = 0;
    while (attempts < room.artistQueue.length * 2) {
      room.currentArtistIndex = (room.currentArtistIndex + 1) % room.artistQueue.length;
      const candidateId = room.artistQueue[room.currentArtistIndex];
      if (connected.has(candidateId)) {
        return room.players.get(candidateId) ?? null;
      }
      attempts++;
    }
    return null;
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

    /** Build reconnect state for a player rejoining mid-game. */
    buildReconnectState(room: Room, player: ServerPlayer): Record<string, unknown> {
      const isArtist = room.currentRound?.artistId === player.playerId;
      
      const filteredChatHistory = room.chatHistory.filter(msg => {
          if (!msg.isCorrectGuess) return true; // public message
          if (isArtist) return true; // artist sees everything
          if (player.hasGuessedCurrentWord) return true; // correct guesser sees everything
          return false; // still-guessing player doesn't see correct guesses
      });

      const base: Record<string, unknown> = {
        version: 1,
        roomCode: room.roomCode,
        phase: room.phase,
        currentRound: room.totalRoundsPlayed,
        serverTime: Date.now(),
        players: room.playerList.map((p) => room.getPublicPlayerState(p)),
        settings: room.getPublicSettings(),
        chatHistory: filteredChatHistory.slice(-50),
        drawingHistory: room.drawingHistory,
      };

    if (room.currentRound) {
      base["roundStartTimestamp"] = room.currentRound.startTimestamp;
      base["roundEndTimestamp"] = room.currentRound.endTimestamp;
      base["currentArtistId"] = room.currentRound.artistId;
      base["wordLength"] = room.currentRound.secretWord.replace(/ /g, "").length || null;

      if (isArtist) {
        // Artist may receive their own word (they need it to draw)
        base["secretWord"] = room.currentRound.secretWord;
        base["wordPattern"] = room.currentRound.secretWord;
        base["isArtist"] = true;
      } else {
        // Guessers only see the masked pattern — never the answer
        base["wordPattern"] = room.currentRound.wordPattern;
        base["isArtist"] = false;
        base["hasGuessedCurrentWord"] = player.hasGuessedCurrentWord;
      }
    }

    return base;
  }
}
