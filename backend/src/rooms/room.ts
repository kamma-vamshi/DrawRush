/**
 * In-memory Room State
 * The server is the single authoritative source of truth.
 * All mutations happen through typed methods on this class.
 */

import { GamePhase } from "../protocol/types.js";
import { DEFAULT_ROOM_SETTINGS } from "../protocol/types.js";
import type { RoomSettings, PlayerState } from "../protocol/types.js";
import { generateRoomCode, buildWordPattern, pickHintIndex } from "../utils/helpers.js";
import { config } from "../config/config.js";

export interface ServerPlayer {
  playerId: string;       // Firebase UID
  nickname: string;
  avatar: string;
  score: number;
  connected: boolean;
  ready: boolean;
  isArtist: boolean;
  hasGuessedCurrentWord: boolean;
  correctGuessCount: number;
  isMuted: boolean;
  isHost: boolean;
  isBanned: boolean;
  socketId: string | null;
  disconnectedAt: number | null;
  disconnectTimers?: ReturnType<typeof setTimeout>[];
}

export interface DrawingHistoryEvent {
  type: string;
  data: Record<string, unknown>;
  sequenceNumber: number;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  isCorrectGuess: boolean;
  timestamp: number;
}

export interface RoundInfo {
  roundNumber: number;
  artistId: string;
  secretWord: string;          // NEVER sent to guessers
  wordPattern: string;         // masked pattern for guessers
  revealedIndices: Set<number>;
  hintCount: number;
  hintsGiven: number;
  hintIntervalMs: number;
  startTimestamp: number;
  endTimestamp: number;
  correctGuessers: Array<{ playerId: string; timeMs: number; points: number }>;
  wordChoicesForArtist: string[];  // NEVER broadcast
  drawingSequence: number;
  usedWords: Set<string>;
}

export class Room {
  readonly roomId: string;
  readonly roomCode: string;
  phase: GamePhase = GamePhase.LOBBY;
  settings: RoomSettings;
  players: Map<string, ServerPlayer> = new Map();
  currentRound: RoundInfo | null = null;
  totalRoundsPlayed = 0;
  artistQueue: string[] = [];  // ordered list of player IDs for artist rotation
  currentArtistIndex = -1;
  drawingHistory: DrawingHistoryEvent[] = [];
  chatHistory: ChatMessage[] = [];
  createdAt: number = Date.now();
  usedWordsThisGame: Set<string> = new Set();
  phaseTimer: ReturnType<typeof setTimeout> | null = null;
  hintTimer: ReturnType<typeof setTimeout> | null = null;
  gameStartedAt: number | null = null;

  constructor(hostPlayer: ServerPlayer, settings?: Partial<RoomSettings>) {
    this.roomId = generateRoomCode(); // reuse same generator for unique IDs
    this.roomCode = this.roomId;
    this.settings = { ...DEFAULT_ROOM_SETTINGS, ...settings };
    hostPlayer.isHost = true;
    this.players.set(hostPlayer.playerId, hostPlayer);
  }

  get playerList(): ServerPlayer[] {
    return Array.from(this.players.values());
  }

  get connectedPlayers(): ServerPlayer[] {
    return this.playerList.filter((p) => p.connected && !p.isBanned);
  }

  get eligibleGuessers(): ServerPlayer[] {
    if (!this.currentRound) return [];
    return this.connectedPlayers.filter(
      (p) => p.playerId !== this.currentRound!.artistId && !p.hasGuessedCurrentWord
    );
  }

  get host(): ServerPlayer | undefined {
    return this.playerList.find((p) => p.isHost);
  }

  getPublicPlayerState(player: ServerPlayer): PlayerState {
    return {
      playerId: player.playerId,
      nickname: player.nickname,
      avatar: player.avatar,
      score: player.score,
      connected: player.connected,
      ready: player.ready,
      isArtist: player.isArtist,
      hasGuessedCurrentWord: player.hasGuessedCurrentWord,
      correctGuessCount: player.correctGuessCount,
      isMuted: player.isMuted,
      isHost: player.isHost,
    };
  }

  getPublicSettings(): Omit<RoomSettings, 'customWords'> & { customWordCount: number } {
    const { customWords, ...rest } = this.settings;
    return {
      ...rest,
      customWordCount: customWords ? customWords.length : 0,
    };
  }

  addPlayer(player: ServerPlayer): void {
    this.players.set(player.playerId, player);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  clearHintTimer(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  clearAllTimers(): void {
    this.clearPhaseTimer();
    this.clearHintTimer();
  }

  resetForNewGame(): void {
    this.totalRoundsPlayed = 0;
    this.currentRound = null;
    this.drawingHistory = [];
    this.chatHistory = [];
    this.usedWordsThisGame = new Set();
    this.artistQueue = [];
    this.currentArtistIndex = -1;
    this.gameStartedAt = null;
    for (const player of this.players.values()) {
      player.score = 0;
      player.correctGuessCount = 0;
      player.isArtist = false;
      player.hasGuessedCurrentWord = false;
      player.ready = false;
    }
  }

  resetForNewRound(): void {
    this.drawingHistory = [];
    for (const player of this.players.values()) {
      player.isArtist = false;
      player.hasGuessedCurrentWord = false;
    }
  }

  addDrawingEvent(event: DrawingHistoryEvent): void {
    this.drawingHistory.push(event);
    // Cap history to prevent memory abuse
    if (this.drawingHistory.length > config.MAX_CANVAS_HISTORY) {
      this.drawingHistory.shift();
    }
  }

  addChatMessage(msg: ChatMessage): void {
    this.chatHistory.push(msg);
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
  }

  /** Build next hint and update pattern. Returns new pattern or null if no more letters. */
  revealNextHint(): string | null {
    if (!this.currentRound) return null;
    const idx = pickHintIndex(this.currentRound.secretWord, this.currentRound.revealedIndices);
    if (idx === null) return null;
    this.currentRound.revealedIndices.add(idx);
    this.currentRound.wordPattern = buildWordPattern(
      this.currentRound.secretWord,
      this.currentRound.revealedIndices
    );
    this.currentRound.hintsGiven++;
    return this.currentRound.wordPattern;
  }
}
