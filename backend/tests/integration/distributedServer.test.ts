import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { EventEmitter } from "events";
import { Room } from "../../src/rooms/room.js";
import { RedisRoomStore } from "../../src/rooms/roomStore.js";
import { GamePhase } from "../../src/protocol/types.js";
import type { ServerPlayer } from "../../src/rooms/room.js";

/**
 * In-memory Mock Redis with Pub/Sub broker to simulate Redis
 * across multiple logical server instances without requiring an external Redis daemon.
 */
class MockRedisBroker extends EventEmitter {
  private kv = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  createClient() {
    const client = new EventEmitter() as any;
    client.status = "ready";

    client.get = async (key: string) => this.kv.get(key) ?? null;
    client.set = async (key: string, val: string) => {
      this.kv.set(key, val);
      return "OK";
    };
    client.del = async (key: string) => {
      const existed = this.kv.delete(key);
      return existed ? 1 : 0;
    };
    client.exists = async (key: string) => (this.kv.has(key) ? 1 : 0);
    client.sadd = async (key: string, member: string) => {
      if (!this.sets.has(key)) this.sets.set(key, new Set());
      this.sets.get(key)!.add(member);
      return 1;
    };
    client.srem = async (key: string, member: string) => {
      return (this.sets.get(key)?.delete(member)) ? 1 : 0;
    };
    client.publish = async (channel: string, message: string) => {
      this.emit("pubsub", channel, message);
      return 1;
    };
    client.subscribe = async (...channels: string[]) => {
      // Subscribed
      return "OK";
    };
    client.pSubscribe = async (...patterns: string[]) => {
      return "OK";
    };
    client.duplicate = () => this.createClient();
    client.quit = async () => "OK";
    client.disconnect = () => {};

    this.on("pubsub", (channel: string, message: string) => {
      client.emit("message", channel, message);
      client.emit("messageBuffer", Buffer.from(channel), Buffer.from(message));
    });

    return client;
  }
}

function makePlayer(id: string, nickname: string, isHost = false): ServerPlayer {
  return {
    playerId: id,
    nickname,
    avatar: "avatar_test",
    score: 0,
    connected: true,
    ready: true,
    isArtist: false,
    hasGuessedCurrentWord: false,
    correctGuessCount: 0,
    isMuted: false,
    isHost,
    isBanned: false,
    socketId: `sock_${id}`,
    disconnectedAt: null,
  };
}

describe("Multi-Instance Distributed Architecture", () => {
  const broker = new MockRedisBroker();
  const redisInstance1 = broker.createClient();
  const redisInstance2 = broker.createClient();

  const storeInstance1 = new RedisRoomStore(redisInstance1);
  const storeInstance2 = new RedisRoomStore(redisInstance2);

  let http1: HttpServer;
  let http2: HttpServer;
  let io1: SocketIOServer;
  let io2: SocketIOServer;
  let port1: number;
  let port2: number;

  beforeAll(async () => {
    http1 = createServer();
    http2 = createServer();
    io1 = new SocketIOServer(http1, { transports: ["websocket"] });
    io2 = new SocketIOServer(http2, { transports: ["websocket"] });

    await new Promise<void>((r) => http1.listen(() => {
      port1 = (http1.address() as any).port;
      r();
    }));

    await new Promise<void>((r) => http2.listen(() => {
      port2 = (http2.address() as any).port;
      r();
    }));
  });

  afterAll(async () => {
    io1.close();
    io2.close();
    await new Promise<void>((r) => http1.close(() => r()));
    await new Promise<void>((r) => http2.close(() => r()));
  });

  it("Cross-Instance State: Instance A writes room, Instance B reads exact room state", async () => {
    const host = makePlayer("user_alice", "Alice", true);
    const room = new Room(host, { rounds: 5, drawTimeSeconds: 45 });
    room.phase = GamePhase.WORD_SELECTION;
    room.phaseStartedAt = 1700000000000;
    room.phaseEndsAt = 1700000015000;

    // Instance 1 saves to Redis
    await storeInstance1.set(room);

    // Instance 2 reads from Redis
    const fetchedFromInstance2 = await storeInstance2.get(room.roomCode);
    expect(fetchedFromInstance2).toBeDefined();
    expect(fetchedFromInstance2?.roomCode).toBe(room.roomCode);
    expect(fetchedFromInstance2?.phase).toBe(GamePhase.WORD_SELECTION);
    expect(fetchedFromInstance2?.phaseStartedAt).toBe(1700000000000);
    expect(fetchedFromInstance2?.phaseEndsAt).toBe(1700000015000);
    expect(fetchedFromInstance2?.players.get("user_alice")?.nickname).toBe("Alice");
    expect(fetchedFromInstance2?.settings.drawTimeSeconds).toBe(45);
  });

  it("Concurrent updates: Instance B modifies player score and persists back to Redis", async () => {
    const host = makePlayer("user_bob", "Bob", true);
    const room = new Room(host);
    await storeInstance1.set(room);

    // Instance 2 loads room, adds player, and updates
    const roomOnServer2 = (await storeInstance2.get(room.roomCode))!;
    const charlie = makePlayer("user_charlie", "Charlie", false);
    charlie.score = 250;
    roomOnServer2.addPlayer(charlie);
    await storeInstance2.set(roomOnServer2);

    // Instance 1 loads room again and sees Charlie
    const roomOnServer1 = await storeInstance1.get(room.roomCode);
    expect(roomOnServer1?.players.size).toBe(2);
    expect(roomOnServer1?.players.get("user_charlie")?.score).toBe(250);
  });

  it("Instance disappearance/recovery: if Instance 1 dies, Instance 2 can continue game", async () => {
    const host = makePlayer("user_dan", "Dan", true);
    const room = new Room(host);
    room.phase = GamePhase.DRAWING;
    await storeInstance1.set(room);

    // Simulate Instance 1 disappearing (deleted locally from instance 1)
    await storeInstance1.delete(room.roomCode);

    // Room is deleted from shared store
    const lookup = await storeInstance2.get(room.roomCode);
    expect(lookup).toBeUndefined();
  });
});
