/**
 * Integration tests for the Game Engine state machine.
 * These tests exercise the authoritative server-side state transitions
 * without requiring Redis or Firebase — they test pure logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Room } from "../../src/rooms/room.js";
import { GameEngine } from "../../src/game/gameEngine.js";
import { GamePhase } from "../../src/protocol/types.js";
import type { ServerPlayer } from "../../src/rooms/room.js";
import type { Server as SocketServer } from "socket.io";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(id: string, nickname: string, isHost = false): ServerPlayer {
  return {
    playerId: id,
    nickname,
    avatar: "🦊",
    score: 0,
    connected: true,
    ready: true,
    isArtist: false,
    hasGuessedCurrentWord: false,
    correctGuessCount: 0,
    isMuted: false,
    isHost,
    isBanned: false,
    socketId: `socket-${id}`,
    disconnectedAt: null,
  };
}

function makeMockSocket(socketId: string) {
  return {
    id: socketId,
    emit: vi.fn(),
  };
}

function makeMockIO(sockets: Record<string, ReturnType<typeof makeMockSocket>>) {
  return {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    sockets: {
      sockets: new Map(Object.entries(sockets)),
    },
  } as unknown as SocketServer;
}

function makeRoom(hostId = "host-1", settings?: Partial<Room["settings"]>) {
  const host = makePlayer(hostId, "Host", true);
  const room = new Room(host);
  if (settings) {
    Object.assign(room.settings, settings);
  }
  return room;
}

// ─── Room State ────────────────────────────────────────────────────────────────

describe("Room: initial state", () => {
  it("starts in LOBBY phase", () => {
    const room = makeRoom();
    expect(room.phase).toBe(GamePhase.LOBBY);
  });

  it("generates a 6-char room code", () => {
    const room = makeRoom();
    expect(room.roomCode).toHaveLength(6);
    expect(room.roomCode).toBe(room.roomCode.toUpperCase());
  });

  it("host is correctly set", () => {
    const room = makeRoom("p1");
    expect(room.host?.playerId).toBe("p1");
    expect(room.host?.isHost).toBe(true);
  });
});

describe("Room: player management", () => {
  it("adds players", () => {
    const room = makeRoom();
    const p2 = makePlayer("p2", "Player2");
    room.addPlayer(p2);
    expect(room.players.size).toBe(2);
  });

  it("removes players", () => {
    const room = makeRoom("p1");
    const p2 = makePlayer("p2", "Player2");
    room.addPlayer(p2);
    room.removePlayer("p2");
    expect(room.players.size).toBe(1);
  });

  it("connectedPlayers excludes banned", () => {
    const room = makeRoom("p1");
    const p2 = makePlayer("p2", "Player2");
    p2.isBanned = true;
    room.addPlayer(p2);
    expect(room.connectedPlayers).toHaveLength(1);
  });

  it("connectedPlayers excludes disconnected", () => {
    const room = makeRoom("p1");
    const p2 = makePlayer("p2", "Player2");
    p2.connected = false;
    room.addPlayer(p2);
    expect(room.connectedPlayers).toHaveLength(1);
  });
});

describe("Room: resetForNewGame", () => {
  it("resets all player scores to 0", () => {
    const room = makeRoom("p1");
    const p1 = room.players.get("p1")!;
    p1.score = 500;
    p1.correctGuessCount = 3;
    room.resetForNewGame();
    expect(p1.score).toBe(0);
    expect(p1.correctGuessCount).toBe(0);
  });

  it("resets totalRoundsPlayed to 0", () => {
    const room = makeRoom();
    room.totalRoundsPlayed = 5;
    room.resetForNewGame();
    expect(room.totalRoundsPlayed).toBe(0);
  });

  it("clears usedWordsThisGame", () => {
    const room = makeRoom();
    room.usedWordsThisGame.add("elephant");
    room.resetForNewGame();
    expect(room.usedWordsThisGame.size).toBe(0);
  });
});

describe("Room: hint reveal", () => {
  it("revealNextHint returns new pattern", () => {
    const room = makeRoom("p1");
    const p2 = makePlayer("p2", "Player2");
    room.addPlayer(p2);

    // Manually set up a round
    room.currentRound = {
      roundNumber: 1,
      artistId: "p1",
      secretWord: "cat",
      wordPattern: "_ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 2,
      hintsGiven: 0,
      hintIntervalMs: 20000,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 60000,
      correctGuessers: [],
      wordChoicesForArtist: ["cat", "dog", "fish"],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const newPattern = room.revealNextHint();
    expect(newPattern).not.toBe("_ _ _");
    expect(newPattern).not.toBeNull();
    expect(room.currentRound.hintsGiven).toBe(1);
  });

  it("returns null when all letters revealed", () => {
    const room = makeRoom("p1");
    room.currentRound = {
      roundNumber: 1,
      artistId: "p1",
      secretWord: "cat",
      wordPattern: "C A T",
      revealedIndices: new Set<number>([0, 1, 2]),
      hintCount: 2,
      hintsGiven: 2,
      hintIntervalMs: 20000,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 60000,
      correctGuessers: [],
      wordChoicesForArtist: [],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const result = room.revealNextHint();
    expect(result).toBeNull();
  });
});

// ─── Game Engine ───────────────────────────────────────────────────────────────

describe("GameEngine: host migration", () => {
  it("migrates host to next connected player", () => {
    const host = makePlayer("host-1", "Host", true);
    const room = new Room(host);
    const p2 = makePlayer("p2", "Player2");
    room.addPlayer(p2);

    const mockIO = makeMockIO({
      "socket-host-1": makeMockSocket("socket-host-1"),
      "socket-p2": makeMockSocket("socket-p2"),
    });

    const engine = new GameEngine(mockIO);
    const newHost = engine.migrateHost(room);

    expect(newHost).not.toBeNull();
    expect(newHost?.playerId).toBe("p2");
    expect(newHost?.isHost).toBe(true);
    expect(room.players.get("host-1")?.isHost).toBe(false);
  });

  it("returns null if no connected players besides host", () => {
    const host = makePlayer("host-1", "Host", true);
    const room = new Room(host);

    const mockIO = makeMockIO({});
    const engine = new GameEngine(mockIO);
    const result = engine.migrateHost(room);
    expect(result).toBeNull();
  });
});

describe("GameEngine: submitGuess", () => {
  it("rejects guess from artist", async () => {
    const host = makePlayer("artist-1", "Artist", true);
    const room = new Room(host);
    const p2 = makePlayer("p2", "Guesser");
    room.addPlayer(p2);

    // Set up drawing phase manually
    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 2,
      hintsGiven: 0,
      hintIntervalMs: 20000,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 60000,
      correctGuessers: [],
      wordChoicesForArtist: [],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = makeMockIO({});
    const engine = new GameEngine(mockIO);
    const result = await engine.submitGuess(room, host, "elephant");
    expect(result.correct).toBe(false);
  });

  it("awards correct guesser with points", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    room.addPlayer(guesser);

    const now = Date.now();
    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 2,
      hintsGiven: 0,
      hintIntervalMs: 20000,
      startTimestamp: now,
      endTimestamp: now + 80000, // 80 seconds total
      correctGuessers: [],
      wordChoicesForArtist: [],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const emitSpy = vi.fn();
    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: emitSpy }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const result = await engine.submitGuess(room, guesser, "elephant");

    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(50);
    expect(guesser.hasGuessedCurrentWord).toBe(true);
    expect(guesser.correctGuessCount).toBe(1);
    expect(guesser.score).toBeGreaterThan(0);
  });

  it("rejects already-guessed player", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    guesser.hasGuessedCurrentWord = true;
    room.addPlayer(guesser);

    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 0,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 80000,
      correctGuessers: [{ playerId: "p2", timeMs: 1000, points: 500 }],
      wordChoicesForArtist: [],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const result = await engine.submitGuess(room, guesser, "elephant");
    expect(result.correct).toBe(false);
  });

  it("rejects wrong guess", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    room.addPlayer(guesser);

    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 0,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 80000,
      correctGuessers: [],
      wordChoicesForArtist: [],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const result = await engine.submitGuess(room, guesser, "giraffe");
    expect(result.correct).toBe(false);
    expect(guesser.score).toBe(0);
  });

  it("rejects guess when not in DRAWING phase", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    room.addPlayer(guesser);

    room.phase = GamePhase.LOBBY;

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const result = await engine.submitGuess(room, guesser, "anything");
    expect(result.correct).toBe(false);
  });
});

describe("GameEngine: reconnect state security", () => {
  it("does NOT include secretWord for guessers", () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    room.addPlayer(guesser);

    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 0,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 80000,
      correctGuessers: [],
      wordChoicesForArtist: ["elephant", "giraffe", "zebra"],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const state = engine.buildReconnectState(room, guesser);

    // Guesser must NOT see the secret word
    expect(state["secretWord"]).toBeUndefined();
    expect(state["isArtist"]).toBe(false);
    expect(state["wordPattern"]).toBe("_ _ _ _ _ _ _ _");
  });

  it("DOES include secretWord for artist reconnect", () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const guesser = makePlayer("p2", "Guesser");
    room.addPlayer(guesser);

    room.phase = GamePhase.DRAWING;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "elephant",
      wordPattern: "_ _ _ _ _ _ _ _",
      revealedIndices: new Set<number>(),
      hintCount: 0,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 80000,
      correctGuessers: [],
      wordChoicesForArtist: ["elephant", "giraffe", "zebra"],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    const state = engine.buildReconnectState(room, artist);

    expect(state["secretWord"]).toBe("elephant");
    expect(state["isArtist"]).toBe(true);
  });
});

describe("Room: drawing history", () => {
  it("caps drawing history at MAX_CANVAS_HISTORY", () => {
    const room = makeRoom();
    // Default cap is 500, add 600 events
    for (let i = 0; i < 600; i++) {
      room.addDrawingEvent({
        type: "strokeBatch",
        data: {},
        sequenceNumber: i,
        timestamp: Date.now(),
      });
    }
    // Should be capped
    expect(room.drawingHistory.length).toBeLessThanOrEqual(500);
  });
});

describe("Room: capacity", () => {
  it("maxPlayers defaults to 8", () => {
    const room = makeRoom();
    expect(room.settings.maxPlayers).toBe(8);
  });
});

describe("GameEngine: artistSelectWord validation", () => {
  it("rejects word selection when not in WORD_SELECTION phase", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    room.phase = GamePhase.LOBBY;

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    // Should be a no-op — no exception
    await expect(engine.artistSelectWord(room, "artist-1", "elephant")).resolves.toBeUndefined();
    expect(room.phase).toBe(GamePhase.LOBBY); // Phase should not change
  });

  it("rejects word not in offered choices", async () => {
    const artist = makePlayer("artist-1", "Artist", true);
    const room = new Room(artist);
    const p2 = makePlayer("p2", "Guesser");
    room.addPlayer(p2);

    room.phase = GamePhase.WORD_SELECTION;
    room.currentRound = {
      roundNumber: 1,
      artistId: "artist-1",
      secretWord: "",
      wordPattern: "",
      revealedIndices: new Set<number>(),
      hintCount: 2,
      hintsGiven: 0,
      hintIntervalMs: 0,
      startTimestamp: 0,
      endTimestamp: 0,
      correctGuessers: [],
      wordChoicesForArtist: ["elephant", "giraffe", "zebra"],
      drawingSequence: 0,
      usedWords: new Set<string>(),
    };

    const mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      sockets: { sockets: new Map() },
    } as unknown as SocketServer;

    const engine = new GameEngine(mockIO);
    await engine.artistSelectWord(room, "artist-1", "hotdog"); // not in choices
    // Should remain in WORD_SELECTION or the word should be empty
    expect(room.currentRound?.secretWord).toBe("");
  });
});
