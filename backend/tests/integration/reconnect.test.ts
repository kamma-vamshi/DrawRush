import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/middleware/socketHandlers';
import { config } from '../../src/config/config';
import { roomStore } from '../../src/rooms/roomStore';
import { C2S, S2C } from '../../src/protocol/events';

describe('C3 Reconnection', () => {
  let ioServer: SocketIOServer;
  let httpServer: HttpServer;
  let port: number;

  beforeAll(async () => {
    config.DEV_AUTH = true;
    config.DISCONNECT_GRACE_MS = 200;
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

  function connectClient(token: string): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });
      client.on('connect', () => resolve(client));
    });
  }

  it('Test 1: Reconnect same player and rebinds to new socket without duplicating', async () => {
    const token = 'dev:c3-test-1';
    const clientA = await connectClient(token);

    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { nickname: 'PlayerOne', avatar: 'avatar_01' });
    
    await new Promise<void>((resolve) => {
      clientA.on(S2C.ROOM_CREATED, (data) => {
        roomCode = data.roomCode;
        resolve();
      });
    });

    const room = roomStore.get(roomCode);
    expect(room).toBeDefined();
    expect(room!.players.size).toBe(1);
    const playerId = Array.from(room!.players.keys())[0];

    clientA.disconnect();
    
    const clientB = await connectClient(token);
    const updatePromise = new Promise<void>((resolve) => {
        clientB.on(S2C.ROOM_UPDATED, () => resolve());
    });

    clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'PlayerOne', avatar: 'avatar_01' });

    await updatePromise;

    expect(room!.players.size).toBe(1);
    const reconnectedPlayer = room!.players.get(playerId);
    expect(reconnectedPlayer).toBeDefined();
    expect(reconnectedPlayer!.socketId).toBe(clientB.id);
    expect(reconnectedPlayer!.connected).toBe(true);

    clientB.disconnect();
  });

  it('Test 2: Reconnect restores room membership and sends reconnectState', async () => {
    const token = 'dev:c3-test-2';
    const clientA = await connectClient(token);

    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { nickname: 'PlayerTwo', avatar: 'avatar_01' });
    await new Promise<void>((resolve) => {
      clientA.on(S2C.ROOM_CREATED, (data) => {
        roomCode = data.roomCode;
        resolve();
      });
    });

    clientA.disconnect();

    const clientB = await connectClient(token);
    
    const reconnectStatePromise = new Promise<any>((resolve) => {
        clientB.on(S2C.RECONNECT_STATE, (state) => resolve(state));
    });

    clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'PlayerTwo', avatar: 'avatar_01' });
    
    const state = await reconnectStatePromise;
    expect(state).toBeDefined();
    expect(state.roomCode).toBe(roomCode);

    clientB.disconnect();
  });

  it('Test 3: Pending removal timer is cancelled', async () => {
    const token = 'dev:c3-test-3';
    const clientA = await connectClient(token);

    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { nickname: 'PlayerThree', avatar: 'avatar_01' });
    await new Promise<void>((resolve) => {
      clientA.on(S2C.ROOM_CREATED, (data) => {
        roomCode = data.roomCode;
        resolve();
      });
    });

    clientA.disconnect();

    const clientB = await connectClient(token);
    const statePromise = new Promise<void>((resolve) => {
        clientB.on(S2C.RECONNECT_STATE, () => resolve());
    });
    clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'PlayerThree', avatar: 'avatar_01' });

    await statePromise;

    await new Promise((resolve) => setTimeout(resolve, 300));

    const room = roomStore.get(roomCode);
    expect(room!.players.size).toBe(1);

    clientB.disconnect();
  });

  it('Test 4: Stale socket race is prevented', async () => {
    const token = 'dev:c3-test-4';
    const clientA = await connectClient(token);

    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { nickname: 'PlayerFour', avatar: 'avatar_01' });
    await new Promise<void>((resolve) => {
      clientA.on(S2C.ROOM_CREATED, (data) => {
        roomCode = data.roomCode;
        resolve();
      });
    });

    const clientB = await connectClient(token);
    const updatePromise = new Promise<void>((resolve) => {
        clientB.on(S2C.ROOM_UPDATED, () => resolve());
    });
    clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'PlayerFour', avatar: 'avatar_01' });

    await updatePromise;

    clientA.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const room = roomStore.get(roomCode);
    const playerId = Array.from(room!.players.keys())[0];
    const player = room!.players.get(playerId);
    
    expect(player!.connected).toBe(true);
    expect(player!.socketId).toBe(clientB.id);

    clientB.disconnect();
  });
});
