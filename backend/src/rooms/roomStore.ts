import { Room } from "./room.js";
import { logger } from "../utils/logger.js";

/**
 * In-memory store of all active rooms.
 * Maps roomCode → Room.
 */
class RoomStore {
  private rooms = new Map<string, Room>();

  get(roomCode: string): Room | undefined {
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

  /** Find the room a player is currently in. */
  findByPlayerId(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) return room;
    }
    return undefined;
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Cleanup empty or abandoned rooms. */
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

export const roomStore = new RoomStore();

// Periodic purge every 5 minutes
setInterval(() => roomStore.purgeEmpty(), 5 * 60 * 1000);
