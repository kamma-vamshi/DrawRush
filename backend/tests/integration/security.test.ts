import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/middleware/socketHandlers';
import { config } from '../../src/config/config';
import { roomStore } from '../../src/rooms/roomStore';
import { C2S, S2C } from '../../src/protocol/events';
import { ErrorCode } from '../../src/protocol/errors';

describe('Adversarial Security & Authorization Tests', () => {
  let ioServer: SocketIOServer;
  let httpServer: HttpServer;
  let port: number;

  beforeAll(async () => {
    config.DEV_AUTH = true;
    httpServer = createServer();
    ioServer = new SocketIOServer(httpServer);
    registerSocketHandlers(ioServer);
    
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connectClient(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = Client(`http://localhost:${port}`, {
        auth: token ? { token } : undefined,
        transports: ['websocket'],
      });
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  it('rejects socket connection when no token is provided', async () => {
    await expect(connectClient()).rejects.toThrow();
  });

  it('rejects non-host from starting game', async () => {
    const host = await connectClient('dev:sec-host');
    const guest = await connectClient('dev:sec-guest');

    let roomCode = '';
    host.emit(C2S.CREATE_ROOM, { nickname: 'Host', avatar: '1' });
    await new Promise<void>((resolve) => {
      host.once(S2C.ROOM_CREATED, (d) => {
        roomCode = d.roomCode;
        resolve();
      });
    });

    guest.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guest', avatar: '2' });
    await new Promise<void>((resolve) => guest.once(S2C.ROOM_UPDATED, () => resolve()));

    const errorPromise = new Promise<any>((resolve) => {
      guest.once(S2C.ERROR, (err) => resolve(err));
    });

    // Guest attempts to start game
    guest.emit(C2S.START_GAME, { roomCode });

    const err = await errorPromise;
    expect(err.code).toBe(ErrorCode.NOT_HOST);

    host.disconnect();
    guest.disconnect();
  });

  it('drops strokeStart from non-artist', async () => {
    const host = await connectClient('dev:sec-stroke-host');
    const guest = await connectClient('dev:sec-stroke-guest');

    let roomCode = '';
    host.emit(C2S.CREATE_ROOM, { nickname: 'Host', avatar: '1' });
    await new Promise<void>((resolve) => {
      host.once(S2C.ROOM_CREATED, (d) => {
        roomCode = d.roomCode;
        resolve();
      });
    });

    guest.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guest', avatar: '2' });
    await new Promise<void>((resolve) => guest.once(S2C.ROOM_UPDATED, () => resolve()));

    const room = roomStore.get(roomCode);
    expect(room).toBeDefined();

    // Guest attempts to draw without game being in DRAWING phase and without being artist
    guest.emit(C2S.STROKE_START, {
      roomCode,
      strokeId: '123e4567-e89b-12d3-a456-426614174000',
      sequenceNumber: 1,
      color: '#000000',
      width: 0.01,
      tool: 'brush',
      point: { x: 0.5, y: 0.5 }
    });

    // Wait a brief moment to ensure nothing was processed
    await new Promise((r) => setTimeout(r, 100));

    expect(room!.drawingHistory.length).toBe(0);

    host.disconnect();
    guest.disconnect();
  });
});
