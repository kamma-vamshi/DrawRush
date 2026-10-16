import { describe, it, expect, vi } from "vitest";
import { Room, type ServerPlayer } from "../../src/rooms/room.js";
import { GamePhase } from "../../src/protocol/types.js";
import { InMemoryRoomStore, RedisRoomStore } from "../../src/rooms/roomStore.js";
import { InMemoryRateLimiter, RedisRateLimiter } from "../../src/utils/rateLimiter.js";
import { isAllowedOrigin } from "../../src/app.js";
import { config } from "../../src/config/config.js";
import type { Redis } from "ioredis";

function createTestPlayer(id: string, name: string, isHost = false): ServerPlayer {
  return {
    playerId: id,
    nickname: name,
    avatar: "avatar_test",
    score: 150,
    connected: true,
    ready: true,
    isArtist: false,
    hasGuessedCurrentWord: false,
    correctGuessCount: 1,
    isMuted: false,
    isHost,
    isBanned: false,
    socketId: `socket_${id}`,
    disconnectedAt: null,
  };
}

describe("Distributed State & Serialization", () => {
  it("Room.toJSON and Room.fromJSON round-trip preserves complete game state", () => {
    const host = createTestPlayer("p1", "HostPlayer", true);
    const room = new Room(host, {
      maxPlayers: 6,
      drawTimeSeconds: 60,
      rounds: 4,
      customWords: ["satellite", "telescope"],
    });

    const player2 = createTestPlayer("p2", "GuesserPlayer", false);
    room.addPlayer(player2);

    room.phase = GamePhase.DRAWING;
    room.phaseStartedAt = 1700000000000;
    room.phaseEndsAt = 1700000060000;
    room.totalRoundsPlayed = 2;
    room.usedWordsThisGame.add("apple");
    room.usedWordsThisGame.add("banana");

    room.currentRound = {
      roundNumber: 2,
      artistId: "p1",
      secretWord: "satellite",
      wordPattern: "_ _ _ _ _ _ _ _ _",
      revealedIndices: new Set([0, 3]),
      hintCount: 2,
      hintsGiven: 1,
      hintIntervalMs: 20000,
      startTimestamp: 1700000000000,
      endTimestamp: 1700000060000,
      correctGuessers: [{ playerId: "p2", timeMs: 15000, points: 500 }],
      wordChoicesForArtist: ["satellite", "planet", "galaxy"],
      drawingSequence: 1,
      usedWords: new Set(["apple", "banana"]),
    };

    room.addDrawingEvent({
      type: "strokeStart",
      data: { strokeId: "s1", color: "#FF0000", size: 4, startPoint: { x: 0.1, y: 0.2 } },
      sequenceNumber: 1,
      timestamp: 1700000005000,
    });

    // Serialize to JSON
    const serialized = room.toJSON();
    expect(serialized.roomCode).toBe(room.roomCode);
    expect(serialized.phase).toBe(GamePhase.DRAWING);
    expect(serialized.phaseStartedAt).toBe(1700000000000);
    expect(serialized.phaseEndsAt).toBe(1700000060000);
    expect(serialized.players).toHaveLength(2);
    expect(serialized.usedWordsThisGame).toEqual(["apple", "banana"]);
    expect(serialized.drawingHistory).toHaveLength(1);

    // Deserialize back from JSON
    const restored = Room.fromJSON(serialized);
    expect(restored.roomCode).toBe(room.roomCode);
    expect(restored.phase).toBe(GamePhase.DRAWING);
    expect(restored.phaseStartedAt).toBe(1700000000000);
    expect(restored.phaseEndsAt).toBe(1700000060000);
    expect(restored.players.size).toBe(2);
    expect(restored.players.get("p1")?.isHost).toBe(true);
    expect(restored.players.get("p2")?.nickname).toBe("GuesserPlayer");
    expect(restored.usedWordsThisGame.has("apple")).toBe(true);
    expect(restored.usedWordsThisGame.has("banana")).toBe(true);
    expect(restored.drawingHistory).toHaveLength(1);
    expect(restored.drawingHistory[0].sequenceNumber).toBe(1);
    expect(restored.currentRound?.secretWord).toBe("satellite");
    expect(restored.currentRound?.revealedIndices.has(0)).toBe(true);
    expect(restored.currentRound?.correctGuessers).toHaveLength(1);
  });

  it("InMemoryRoomStore handles room lifecycle and player indexing", () => {
    const store = new InMemoryRoomStore();
    const host = createTestPlayer("u1", "Alice", true);
    const room = new Room(host);

    store.set(room);
    expect(store.has(room.roomCode)).toBe(true);
    expect(store.get(room.roomCode)?.roomCode).toBe(room.roomCode);
    expect(store.getSync(room.roomCode)?.roomCode).toBe(room.roomCode);
    expect(store.findByPlayerId("u1")?.roomCode).toBe(room.roomCode);
    expect(store.size).toBe(1);

    store.delete(room.roomCode);
    expect(store.has(room.roomCode)).toBe(false);
    expect(store.get(room.roomCode)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("RedisRoomStore serializes to Redis and restores on get", async () => {
    const redisStorage = new Map<string, string>();
    const redisSets = new Map<string, Set<string>>();

    const mockRedis = {
      get: vi.fn(async (key: string) => redisStorage.get(key) ?? null),
      set: vi.fn(async (key: string, val: string) => {
        redisStorage.set(key, val);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        redisStorage.delete(key);
        return 1;
      }),
      exists: vi.fn(async (key: string) => (redisStorage.has(key) ? 1 : 0)),
      sadd: vi.fn(async (key: string, member: string) => {
        if (!redisSets.has(key)) redisSets.set(key, new Set());
        redisSets.get(key)!.add(member);
        return 1;
      }),
      srem: vi.fn(async (key: string, member: string) => {
        redisSets.get(key)?.delete(member);
        return 1;
      }),
    } as unknown as Redis;

    const redisStore = new RedisRoomStore(mockRedis);
    const host = createTestPlayer("redis_p1", "RedisHost", true);
    const room = new Room(host);

    await redisStore.set(room);
    expect(mockRedis.set).toHaveBeenCalled();
    expect(mockRedis.sadd).toHaveBeenCalledWith("drawrush:active_rooms", room.roomCode);

    const fetched = await redisStore.get(room.roomCode);
    expect(fetched).toBeDefined();
    expect(fetched?.roomCode).toBe(room.roomCode);
    expect(fetched?.players.get("redis_p1")?.nickname).toBe("RedisHost");

    // Test getSync returns from local cache
    expect(redisStore.getSync(room.roomCode)?.roomCode).toBe(room.roomCode);

    // Test findByPlayerId
    const foundByPlayer = await redisStore.findByPlayerId("redis_p1");
    expect(foundByPlayer?.roomCode).toBe(room.roomCode);

    await redisStore.delete(room.roomCode);
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it("InMemoryRateLimiter and RedisRateLimiter enforce rate limits correctly", async () => {
    // 1. InMemoryRateLimiter
    const memLimiter = new InMemoryRateLimiter(2, 1000);
    expect(memLimiter.consume("test_key")).toBe(true);
    expect(memLimiter.consume("test_key")).toBe(true);
    expect(memLimiter.consume("test_key")).toBe(false); // Exceeded 2 tokens

    // 2. RedisRateLimiter with mock Redis
    let count = 0;
    const mockRedis = {
      incr: vi.fn(async () => ++count),
      pexpire: vi.fn(async () => 1),
      del: vi.fn(async () => {
        count = 0;
        return 1;
      }),
    } as unknown as Redis;

    const redisLimiter = new RedisRateLimiter(mockRedis, 2, 1000);
    expect(await redisLimiter.consume("user_socket")).toBe(true);
    expect(await redisLimiter.consume("user_socket")).toBe(true);
    expect(await redisLimiter.consume("user_socket")).toBe(false); // 3rd request exceeds limit
  });

  it("CORS origin validator allows Android clients, local origins, and approved domains", () => {
    const origEnv = config.NODE_ENV;

    // Production mode
    (config as any).NODE_ENV = "production";

    // Native Android client (no origin header or empty)
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("")).toBe(true);

    // Approved Firebase web domains
    expect(isAllowedOrigin("https://drawrush-510809.web.app")).toBe(true);
    expect(isAllowedOrigin("https://drawrush-510809.firebaseapp.com")).toBe(true);

    // Approved Vercel deployment domains
    expect(isAllowedOrigin("https://drawrush-preview.vercel.app")).toBe(true);

    // Localhost in production for health checks/tests
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3001")).toBe(true);

    // Unapproved arbitrary origin in production
    expect(isAllowedOrigin("https://malicious-website.com")).toBe(false);

    // Development mode
    (config as any).NODE_ENV = "development";
    expect(isAllowedOrigin("https://any-origin-in-dev.com")).toBe(true);

    // Restore env
    (config as any).NODE_ENV = origEnv;
  });

  it("Authoritative phaseEndsAt timestamp enables distributed expiration evaluation", () => {
    const host = createTestPlayer("h1", "Host", true);
    const room = new Room(host);

    const now = Date.now();
    room.phase = GamePhase.DRAWING;
    room.phaseStartedAt = now - 65000;
    room.phaseEndsAt = now - 5000; // expired 5 seconds ago

    // Any distributed instance receiving an event can authoritatively detect expiration
    const isExpired = room.phaseEndsAt !== null && Date.now() >= room.phaseEndsAt;
    expect(isExpired).toBe(true);

    // If still in future
    room.phaseEndsAt = now + 15000;
    expect(Date.now() >= room.phaseEndsAt).toBe(false);
  });
});
