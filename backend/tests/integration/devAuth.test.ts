import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/middleware/socketHandlers';
import { config } from '../../src/config/config';

describe('DEV_AUTH Reconnection Identity', () => {
  let ioServer: SocketIOServer;
  let httpServer: HttpServer;
  let port: number;

  beforeAll(async () => {
    config.DEV_AUTH = true; // Ensure DEV_AUTH is true for this test
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
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('recovers the same logical player identity on reconnect with same dev token', async () => {
    const devToken = 'dev:test-uid-123';
    let firstPlayerId: string | null = null;

    await new Promise<void>((resolve, reject) => {
      const client1 = Client(`http://localhost:${port}`, {
        auth: { token: devToken },
        transports: ['websocket'],
      });

      client1.on('userProfile', (profile) => {
        firstPlayerId = profile.id;
        expect(profile.googleId).toBe('test-uid-123');
        
        // Disconnect and reconnect
        client1.disconnect();

        const client2 = Client(`http://localhost:${port}`, {
          auth: { token: devToken },
          transports: ['websocket'],
        });

        client2.on('userProfile', (profile2) => {
          try {
            expect(profile2.id).toBe(firstPlayerId);
            expect(profile2.googleId).toBe('test-uid-123');
            client2.disconnect();
            resolve();
          } catch (err) {
            client2.disconnect();
            reject(err);
          }
        });

        client2.on('connect_error', reject);
      });

      client1.on('connect_error', reject);
    });
  });
});
