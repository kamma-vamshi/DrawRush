import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/middleware/socketHandlers';
import { config } from '../../src/config/config';
import { roomStore } from '../../src/rooms/roomStore';
import { C2S, S2C } from '../../src/protocol/events';
import { GamePhase } from '../../src/protocol/types';
import { normalizeGuess } from '../../src/utils/helpers';

describe('H1 Leak Integration Tests', () => {
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

  async function setupGameAndGetSecret(clientA: ClientSocket, clientB: ClientSocket, clientC: ClientSocket) {
    let roomCode = '';
    clientA.emit(C2S.CREATE_ROOM, { nickname: 'Artist', avatar: '1' });
    await new Promise<void>((resolve) => clientA.once(S2C.ROOM_CREATED, (d) => { roomCode = d.roomCode; resolve(); }));
    
    clientB.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guesser1', avatar: '1' });
    await new Promise<void>((resolve) => clientB.once(S2C.PLAYER_JOINED, () => resolve()));
    
    clientC.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'Guesser2', avatar: '1' });
    await new Promise<void>((resolve) => clientC.once(S2C.PLAYER_JOINED, () => resolve()));

    clientA.emit(C2S.START_GAME, { roomCode });
    await new Promise<void>((resolve) => clientA.once(S2C.COUNTDOWN_STARTED, () => resolve()));
    
    // Wait for word choices (artist should be clientA because they are the only one in the queue first, wait actually artist queue is shuffled)
    // To ensure clientA is the artist, let's observe who gets WORD_CHOICES
    
    return new Promise<{ artist: ClientSocket, guesser1: ClientSocket, guesser2: ClientSocket, secretWord: string, roomCode: string }>(resolve => {
        const handleChoices = (client: ClientSocket, others: ClientSocket[]) => (data: any) => {
            const secretWord = data.choices[0];
            client.emit(C2S.SELECT_WORD, { roomCode, word: secretWord });
            client.once(S2C.DRAWING_STARTED, () => {
                resolve({ artist: client, guesser1: others[0], guesser2: others[1], secretWord, roomCode });
            });
        };
        clientA.once(S2C.WORD_CHOICES, handleChoices(clientA, [clientB, clientC]));
        clientB.once(S2C.WORD_CHOICES, handleChoices(clientB, [clientA, clientC]));
        clientC.once(S2C.WORD_CHOICES, handleChoices(clientC, [clientA, clientB]));
    });
  }

  it('Test 1: Artist chat must not leak answer', async () => {
    const clientA = await connectClient('dev:a');
    const clientB = await connectClient('dev:b');
    const clientC = await connectClient('dev:c');

    const { artist, guesser1, secretWord, roomCode } = await setupGameAndGetSecret(clientA, clientB, clientC);

    const receivedChat = new Promise<any>((resolve, reject) => {
      guesser1.on(S2C.CHAT_MESSAGE, (data) => {
        if (data.message.text.includes(secretWord)) {
          reject(new Error("Guesser received the secret word in chat!"));
        } else {
          resolve(data);
        }
      });
      // Also wait a bit to ensure it doesn't arrive
      setTimeout(() => resolve(null), 200);
    });

    artist.emit(C2S.CHAT_MESSAGE, { roomCode, text: `The answer is ${secretWord}` });

    await expect(receivedChat).resolves.toBeNull(); // Should not receive

    clientA.disconnect(); clientB.disconnect(); clientC.disconnect();
  });

  it('Test 2: Artist submit guess must not leak answer', async () => {
    const clientA = await connectClient('dev:a2');
    const clientB = await connectClient('dev:b2');
    const clientC = await connectClient('dev:c2');

    const { artist, guesser1, secretWord, roomCode } = await setupGameAndGetSecret(clientA, clientB, clientC);

    const receivedChat = new Promise<any>((resolve, reject) => {
      guesser1.on(S2C.CHAT_MESSAGE, (data) => {
        if (data.message.text.includes(secretWord)) {
          reject(new Error("Guesser received the secret word from artist submitGuess!"));
        }
      });
      setTimeout(() => resolve(null), 200);
    });

    artist.emit(C2S.SUBMIT_GUESS, { roomCode, guess: secretWord });

    await expect(receivedChat).resolves.toBeNull(); // Should not receive

    clientA.disconnect(); clientB.disconnect(); clientC.disconnect();
  });

  it('Test 3: Correct guesser chat visibility', async () => {
    const clientA = await connectClient('dev:a3');
    const clientB = await connectClient('dev:b3');
    const clientC = await connectClient('dev:c3');

    const { artist, guesser1, guesser2, secretWord, roomCode } = await setupGameAndGetSecret(clientA, clientB, clientC);

    // guesser1 guesses correctly
    guesser1.emit(C2S.SUBMIT_GUESS, { roomCode, guess: secretWord });
    await new Promise<void>(resolve => guesser1.once(S2C.GUESS_RESULT, () => resolve()));

    // now guesser1 sends a chat message
    const receivedChatC = new Promise<any>((resolve, reject) => {
      guesser2.on(S2C.CHAT_MESSAGE, (data) => reject(new Error("Still-guessing player received correct guesser chat!")));
      setTimeout(() => resolve(null), 200);
    });
    
    const receivedChatA = new Promise<any>((resolve) => {
        artist.once(S2C.CHAT_MESSAGE, () => resolve(true));
    });

    guesser1.emit(C2S.CHAT_MESSAGE, { roomCode, text: "I know it!" });

    await expect(receivedChatC).resolves.toBeNull();
    await expect(receivedChatA).resolves.toBe(true);

    clientA.disconnect(); clientB.disconnect(); clientC.disconnect();
  });

  it('Test 4: Answer text from normal player must be treated as a guess', async () => {
    const clientA = await connectClient('dev:a4');
    const clientB = await connectClient('dev:b4');
    const clientC = await connectClient('dev:c4');

    const { artist, guesser1, guesser2, secretWord, roomCode } = await setupGameAndGetSecret(clientA, clientB, clientC);

    const receivedChat = new Promise<any>((resolve, reject) => {
      guesser2.on(S2C.CHAT_MESSAGE, (data) => {
        if (data.message.text.toLowerCase() === secretWord.toLowerCase()) {
          reject(new Error("Answer broadcasted as normal chat!"));
        }
      });
      setTimeout(() => resolve(null), 200);
    });

    const receivedGuessResult = new Promise<any>((resolve) => {
        guesser1.once(S2C.GUESS_RESULT, (d) => resolve(d));
    });

    // Send answer as CHAT_MESSAGE
    guesser1.emit(C2S.CHAT_MESSAGE, { roomCode, text: secretWord });

    await expect(receivedChat).resolves.toBeNull();
    const res = await receivedGuessResult;
    expect(res.correct).toBe(true);

    clientA.disconnect(); clientB.disconnect(); clientC.disconnect();
  });

  it('Test 6: Scan socket payloads for answer leaks (non-artist reconnect state)', async () => {
    const clientA = await connectClient('dev:a6');
    const clientB = await connectClient('dev:b6');
    const clientC = await connectClient('dev:c6');

    // Attach tokens so we know who is who
    (clientA as any).devToken = 'dev:a6';
    (clientB as any).devToken = 'dev:b6';
    (clientC as any).devToken = 'dev:c6';

    const { artist, guesser1, guesser2, secretWord, roomCode } = await setupGameAndGetSecret(clientA, clientB, clientC);

    guesser1.disconnect();
    
    const guesserToken = (guesser1 as any).devToken;
    const clientB2 = await connectClient(guesserToken);
    const state = await new Promise<any>((resolve) => {
        clientB2.once(S2C.RECONNECT_STATE, (s) => resolve(s));
        clientB2.emit(C2S.JOIN_ROOM, { roomCode, nickname: 'GuesserX', avatar: '1' });
    });

    const stateStr = JSON.stringify(state);
    expect(stateStr.toLowerCase()).not.toContain(secretWord.toLowerCase());

    clientA.disconnect(); clientB2.disconnect(); clientC.disconnect();
  });

});
