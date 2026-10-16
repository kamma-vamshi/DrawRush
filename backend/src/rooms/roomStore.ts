import { Room } from "./room.js";
import { logger } from "../utils/logger.js";
import type { Redis } from "ioredis";

export interface IRoomStore {
  get(roomCode: string): Promise<Room | undefined> | Room | undefined;
  getSync?(roomCode: string): Room | undefined;
  set(room: Room): Promise<void> | void;
  delete(roomCode: string): Promise<void> | void;
  has(roomCode: string): Promise<boolean> | boolean;
  findByPlayerId(playerId: string): Promise<Room | undefined> | Room | undefined;
  readonly size: number;
  purgeEmpty(): Promise<void> | void;
}

export class InMemoryRoomStore implements IRoomStore {
  private rooms = new Map<string, Room>();

  get(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  getSync(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  set(room: Room): void {
    this.rooms.set(room.roomCode, room);
    logger.debug({ roomCode: room.roomCode }, "Room created");
  }

  delete(roomCode: string): void {
    this.rooms.delete(roomCode.toUpperCase());
    logger.debug({ roomCode }, "Room deleted");
  }

  has(roomCode: string): boolean {
    return this.rooms.has(roomCode.toUpperCase());
  }

  findByPlayerId(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) return room;
    }
    return undefined;
  }

  get size(): number {
    return this.rooms.size;
  }

  purgeEmpty(): void {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.size === 0) {
        room.clearAllTimers();
        this.rooms.delete(code);
        logger.info({ roomCode: code }, "Purged empty room");
      }
    }
  }
}

export class RedisRoomStore implements IRoomStore {
  // Local cache to minimize network roundtrips and provide fast reads
  private localCache = new Map<string, { room: Room; cachedAt: number }>();

  constructor(private redis: Redis) {}

  getSync(roomCode: string): Room | undefined {
    return this.localCache.get(roomCode.toUpperCase())?.room;
  }

  async get(roomCode: string): Promise<Room | undefined> {
    const upper = roomCode.toUpperCase();
    try {
      const raw = await this.redis.get(`drawrush:room:${upper}`);
      if (!raw) {
        this.localCache.delete(upper);
        return undefined;
      }
      const room = Room.fromJSON(JSON.parse(raw));
      this.localCache.set(upper, { room, cachedAt: Date.now() });
      return room;
    } catch (e) {
      logger.warn({ err: e, roomCode }, "Redis get room failed, checking local cache");
      return this.localCache.get(upper)?.room;
    }
  }

  async set(room: Room): Promise<void> {
    const upper = room.roomCode.toUpperCase();
    this.localCache.set(upper, { room, cachedAt: Date.now() });
    try {
      const json = JSON.stringify(room.toJSON());
      await this.redis.set(`drawrush:room:${upper}`, json, "EX", 86400); // 24h expiration
      await this.redis.sadd("drawrush:active_rooms", upper);
      for (const playerId of room.players.keys()) {
        await this.redis.set(`drawrush:player_room:${playerId}`, upper, "EX", 86400);
      }
      logger.debug({ roomCode: upper }, "Room saved to Redis");
    } catch (e) {
      logger.warn({ err: e, roomCode: upper }, "Redis set room failed");
    }
  }

  async delete(roomCode: string): Promise<void> {
    const upper = roomCode.toUpperCase();
    this.localCache.delete(upper);
    try {
      await this.redis.del(`drawrush:room:${upper}`);
      await this.redis.srem("drawrush:active_rooms", upper);
      logger.debug({ roomCode: upper }, "Room deleted from Redis");
    } catch (e) {
      logger.warn({ err: e, roomCode: upper }, "Redis delete room failed");
    }
  }

  async has(roomCode: string): Promise<boolean> {
    const upper = roomCode.toUpperCase();
    if (this.localCache.has(upper)) return true;
    try {
      return (await this.redis.exists(`drawrush:room:${upper}`)) === 1;
    } catch {
      return false;
    }
  }

  async findByPlayerId(playerId: string): Promise<Room | undefined> {
    try {
      const roomCode = await this.redis.get(`drawrush:player_room:${playerId}`);
      if (!roomCode) return undefined;
      return this.get(roomCode);
    } catch {
      for (const entry of this.localCache.values()) {
        if (entry.room.players.has(playerId)) return entry.room;
      }
      return undefined;
    }
  }

  get size(): number {
    return this.localCache.size;
  }

  async purgeEmpty(): Promise<void> {
    // Rooms automatically expire via Redis TTL
  }
}

export const inMemoryRoomStore = new InMemoryRoomStore();
export let roomStore: IRoomStore = inMemoryRoomStore;

export function setRoomStore(store: IRoomStore): void {
  roomStore = store;
}

// Periodic purge for in-memory store (unref to avoid hanging process exit/tests)
const purgeInterval = setInterval(() => inMemoryRoomStore.purgeEmpty(), 5 * 60 * 1000);
purgeInterval.unref();

