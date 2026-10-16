import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/middleware/socketHandlers';
import { config } from '../../src/config/config';
import { roomStore } from '../../src/rooms/roomStore';
import { C2S, S2C } from '../../src/protocol/events';
import { GamePhase } from '../../src/protocol/types';

describe('H2 Custom Word Leak Integration Tests', () => {
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

  function connectClient(token: string): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });
      client.on('connect', () => resolve(client));
    });
  }

  const customWords = [
    "H2_SECRET_APPLE",
    "H2_SECRET_ROCKET",
    "H2_SECRET_TIGER"
  ];

  it('Test 1: roomCreated custom word leak', async () => {
    const clientA = await connectClient('dev:h2-host');

    const roomCreatedData = await new Promise<any>((resolve) => {
        clientA.once(S2C.ROOM_CREATED, (d) => resolve(d));
        clientA.emit(C2S.CREATE_ROOM, { 
            nickname: 'Host', 
            avatar: '1',
            settings: {
                customWords: customWords
            }
        });
    });

    // Check if the host receives the custom words (this is optional but typically shouldn't be full either unless needed)
    // The test explicitly wants non-host, but wait, ROOM_CREATED is only sent to the creator.
    // The other players get PLAYER_JOINED and ROOM_UPDATED.
    
    // Let's test room updated leak for non-host
    const clientB = await connectClient('dev:h2-guest');
    
    const roomUpdatedData = await new Promise<any>((resolve) => {
        clientB.once(S2C.ROOM_UPDATED, (d) => resolve(d));
        clientB.emit(C2S.JOIN_ROOM, { roomCode: roomCreatedData.roomCode, nickname: 'Guest', avatar: '2' });
    });

    const dataStr = JSON.stringify(roomUpdatedData);
    for (const w of customWords) {
        expect(dataStr).not.toContain(w);
    }
    expect(roomUpdatedData.settings.customWordCount).toBe(3);

    clientA.disconnect(); clientB.disconnect();
  });

  it('Test 3: reconnectState custom word leak', async () => {
    const clientA = await connectClient('dev:h2-host3');
    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { 
        nickname: 'Host', 
        avatar: '1',
        settings: {
            customWords: customWords
        }
    });
    await new Promise<void>((resolve) => clientA.once(S2C.ROOM_CREATED, (d) => { roomCode = d.roomCode; resolve(); }));

    const clientB = await connectClient('dev:h2-guest3');
    await new Promise<void>((resolve) => {
        clientB.once(S2C.PLAYER_JOINED, () => resolve());
        clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guest', avatar: '2' });
    });

    // Non-host disconnects
    clientB.disconnect();

    // Non-host reconnects
    const clientB2 = await connectClient('dev:h2-guest3');
    const reconnectState = await new Promise<any>((resolve) => {
        clientB2.once(S2C.RECONNECT_STATE, (s) => resolve(s));
        clientB2.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guest', avatar: '2' });
    });

    const stateStr = JSON.stringify(reconnectState);
    for (const w of customWords) {
        expect(stateStr).not.toContain(w);
    }
    expect(reconnectState.settings.customWordCount).toBe(3);

    clientA.disconnect(); clientB2.disconnect();
  });
});
