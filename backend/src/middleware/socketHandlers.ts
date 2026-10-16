import { z } from "zod";
import type { Server as SocketServer, Socket } from "socket.io";
import { GamePhase } from "../protocol/types.js";
import type { RoomSettings } from "../protocol/types.js";
import { C2S, S2C } from "../protocol/events.js";
import { ErrorCode } from "../protocol/errors.js";
import { roomStore } from "../rooms/roomStore.js";
import { Room, type ServerPlayer } from "../rooms/room.js";
import { GameEngine } from "../game/gameEngine.js";
import { verifyIdToken } from "../auth/firebase.js";
import {
  validateNickname,
  normalizeGuess,
  clamp,
} from "../utils/helpers.js";
import { chatRateLimiter, drawRateLimiter } from "../utils/rateLimiter.js";
import { validateCustomWords } from "../words/wordDatabase.js";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { userStore } from "../db/userStore.js";
import type { User } from "../db/models.js";
import { registerFriendHandlers } from "../friends/friendHandlers.js";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const CreateRoomSchema = z.object({
  nickname: z.string().min(1).max(20),
  avatar: z.string().min(1).max(50),
  settings: z
    .object({
      maxPlayers: z.number().int().min(2).max(20).optional(),
      rounds: z.number().int().min(1).max(10).optional(),
      drawingTimeSec: z.number().int().min(15).max(240).optional(),
      wordChoiceCount: z.number().int().min(1).max(5).optional(),
      hintCount: z.number().int().min(0).max(5).optional(),
      language: z.string().max(10).optional(),
      categories: z.array(z.string()).max(20).optional(),
      customWords: z.array(z.string().max(30)).max(200).optional(),
      exclusiveCustomWords: z.boolean().optional(),
    })
    .optional(),
});

const JoinRoomSchema = z.object({
  roomCode: z.string().min(4).max(10),
  nickname: z.string().min(1).max(20),
  avatar: z.string().min(1).max(50),
});

const SelectWordSchema = z.object({
  roomCode: z.string(),
  word: z.string().min(1).max(30),
});

const StrokeStartSchema = z.object({
  roomCode: z.string(),
  strokeId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().min(0.001).max(0.1),
  tool: z.enum(["brush", "eraser"]),
  point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
});

const StrokeBatchSchema = z.object({
  roomCode: z.string(),
  strokeId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().min(0.001).max(0.1),
  tool: z.enum(["brush", "eraser"]),
  points: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .min(1)
    .max(50),
});

const StrokeEndSchema = z.object({
  roomCode: z.string(),
  strokeId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
});

const SimpleRoomSchema = z.object({ roomCode: z.string() });

const SubmitGuessSchema = z.object({
  roomCode: z.string(),
  guess: z.string().min(1).max(100),
});

const ChatMessageSchema = z.object({
  roomCode: z.string(),
  text: z.string().min(1).max(200),
});

const PlayerActionSchema = z.object({
  roomCode: z.string(),
  targetPlayerId: z.string(),
});

// ─── Socket metadata ─────────────────────────────────────────────────────────

interface SocketData {
  playerId: string;
  dbUser: User;
  currentRoomCode: string | null;
}

// ─── Handler setup ────────────────────────────────────────────────────────────

export function registerSocketHandlers(io: SocketServer): void {
  const engine = new GameEngine(io);

  function roomChannel(roomCode: string) {
    return `room:${roomCode}`;
  }

  function emitError(socket: Socket, code: ErrorCode, message: string, reqId?: string) {
    socket.emit(S2C.ERROR, { code, message, requestId: reqId ?? null, version: 1 });
  }

  function getPlayerRoom(socket: Socket): Room | null {
    const data = socket.data as SocketData;
    if (!data.currentRoomCode) return null;
    return roomStore.get(data.currentRoomCode) ?? null;
  }

  function getPlayer(socket: Socket, room: Room): ServerPlayer | null {
    const data = socket.data as SocketData;
    return room.players.get(data.playerId) ?? null;
  }

  function broadcastRoomUpdate(room: Room) {
    io.to(roomChannel(room.roomCode)).emit(S2C.ROOM_UPDATED, {
      version: 1,
      roomCode: room.roomCode,
      phase: room.phase,
      settings: room.getPublicSettings(),
      players: room.playerList.map((p) => room.getPublicPlayerState(p)),
      currentRound: room.totalRoundsPlayed,
      currentArtistId: room.currentRound?.artistId ?? null,
      wordPattern: room.currentRound?.wordPattern ?? null,
      wordLength: room.currentRound ? room.currentRound.secretWord.replace(/ /g, "").length : null,
      roundStartTimestamp: room.currentRound?.startTimestamp ?? null,
      roundEndTimestamp: room.currentRound?.endTimestamp ?? null,
      serverTime: Date.now(),
    });
  }

  // ─── Connection / Auth ───────────────────────────────────────────────────

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error("INVALID_TOKEN: No token provided"));
      }
      // Enforce max payload
      const rawPayload = JSON.stringify(socket.handshake);
      if (rawPayload.length > config.MAX_PAYLOAD_BYTES) {
        return next(new Error("PAYLOAD_TOO_LARGE"));
      }
      const { uid, email, name, picture } = await verifyIdToken(token);
      
      let user = await userStore.findByGoogleId(uid);
      if (!user) {
        user = await userStore.createUser(uid, name || "Player", picture || "avatar_01");
      }

      (socket.data as SocketData).playerId = user.id;
      (socket.data as SocketData).dbUser = user;
      (socket.data as SocketData).currentRoomCode = null;
      next();
    } catch (err) {
      logger.warn({ err }, "Socket auth failed");
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;
    logger.debug({ socketId: socket.id, playerId: data.playerId }, "Socket connected");
    if (data.playerId) {
      socket.join(`user:${data.playerId}`);
    }
    if (data.dbUser) {
        socket.emit("userProfile", data.dbUser);
        registerFriendHandlers(io, socket, data.dbUser);
    }

    // ─── CREATE ROOM ────────────────────────────────────────────────────────
    socket.on(C2S.CREATE_ROOM, async (payload: unknown) => {
      const parse = CreateRoomSchema.safeParse(payload);
      if (!parse.success) {
        return emitError(socket, ErrorCode.INVALID_PAYLOAD, parse.error.message);
      }
      const { nickname, avatar, settings } = parse.data;

      const nickCheck = validateNickname(nickname);
      if (!nickCheck.valid) {
        return emitError(socket, ErrorCode[nickCheck.reason as keyof typeof ErrorCode] ?? ErrorCode.NICKNAME_INVALID, "Invalid nickname");
      }

      // Validate custom words if provided
      if (settings?.customWords && settings.customWords.length > 0) {
        const cwCheck = validateCustomWords(settings.customWords);
        if (!cwCheck.valid) {
          return emitError(socket, ErrorCode.CUSTOM_WORD_INVALID, cwCheck.errors.join("; "));
        }
      }

      // Leave previous room if any
      await leaveCurrentRoom(socket, io, engine);

      const player: ServerPlayer = {
        playerId: data.playerId,
        nickname: nickname.trim(),
        avatar,
        score: 0,
        connected: true,
        ready: false,
        isArtist: false,
        hasGuessedCurrentWord: false,
        correctGuessCount: 0,
        isMuted: false,
        isHost: false,
        isBanned: false,
        socketId: socket.id,
        disconnectedAt: null,
      };

      const room = new Room(player, settings);
      roomStore.set(room);
      data.currentRoomCode = room.roomCode;
      socket.join(roomChannel(room.roomCode));

      logger.info({ roomCode: room.roomCode, playerId: data.playerId }, "Room created");

      socket.emit(S2C.ROOM_CREATED, {
        version: 1,
        roomCode: room.roomCode,
        phase: room.phase,
        settings: room.getPublicSettings(),
        players: room.playerList.map((p) => room.getPublicPlayerState(p)),
        serverTime: Date.now(),
      });
    });

    // ─── JOIN ROOM ──────────────────────────────────────────────────────────
    socket.on(C2S.JOIN_ROOM, async (payload: unknown) => {
      const parse = JoinRoomSchema.safeParse(payload);
      if (!parse.success) {
        return emitError(socket, ErrorCode.INVALID_PAYLOAD, parse.error.message);
      }
      const { roomCode, nickname, avatar } = parse.data;
      const normalized = roomCode.toUpperCase().trim();

      const room = roomStore.get(normalized);
      if (!room) return emitError(socket, ErrorCode.ROOM_NOT_FOUND, "Room not found");

      // Check if banned
      const existing = room.players.get(data.playerId);
      if (existing?.isBanned) return emitError(socket, ErrorCode.BANNED, "You are banned from this room");

      // If rejoining (reconnect case)
      if (existing && !existing.isBanned) {
        existing.connected = true;
        existing.socketId = socket.id;
        existing.disconnectedAt = null;
        if (existing.disconnectTimers) {
          existing.disconnectTimers.forEach(clearTimeout);
          existing.disconnectTimers = [];
        }
        data.currentRoomCode = normalized;
        socket.join(roomChannel(normalized));

        // Send full reconnect state
        const reconnectState = engine.buildReconnectState(room, existing);
        socket.emit(S2C.RECONNECT_STATE, reconnectState);
        broadcastRoomUpdate(room);
        logger.info({ roomCode: normalized, playerId: data.playerId }, "Player reconnected");
        return;
      }

      if (room.phase !== GamePhase.LOBBY) {
        return emitError(socket, ErrorCode.GAME_ALREADY_STARTED, "Game already started");
      }
      if (room.connectedPlayers.length >= room.settings.maxPlayers) {
        return emitError(socket, ErrorCode.ROOM_FULL, "Room is full");
      }

      const nickCheck = validateNickname(nickname);
      if (!nickCheck.valid) {
        return emitError(socket, ErrorCode.NICKNAME_INVALID, "Invalid nickname");
      }
      // Check duplicate nickname
      const nickTaken = room.playerList.some(
        (p) => p.nickname.toLowerCase() === nickname.trim().toLowerCase() && !p.isBanned
      );
      if (nickTaken) return emitError(socket, ErrorCode.NICKNAME_TAKEN, "Nickname already taken");

      await leaveCurrentRoom(socket, io, engine);

      const player: ServerPlayer = {
        playerId: data.playerId,
        nickname: nickname.trim(),
        avatar,
        score: 0,
        connected: true,
        ready: false,
        isArtist: false,
        hasGuessedCurrentWord: false,
        correctGuessCount: 0,
        isMuted: false,
        isHost: false,
        isBanned: false,
        socketId: socket.id,
        disconnectedAt: null,
      };

      room.addPlayer(player);
      data.currentRoomCode = normalized;
      socket.join(roomChannel(normalized));

      logger.info({ roomCode: normalized, playerId: data.playerId, nickname }, "Player joined");

      socket.emit(S2C.ROOM_UPDATED, {
        version: 1,
        roomCode: room.roomCode,
        phase: room.phase,
        settings: room.getPublicSettings(),
        players: room.playerList.map((p) => room.getPublicPlayerState(p)),
        serverTime: Date.now(),
      });

      io.to(roomChannel(normalized)).emit(S2C.PLAYER_JOINED, {
        version: 1,
        roomCode: normalized,
        player: room.getPublicPlayerState(player),
        serverTime: Date.now(),
      });

      broadcastRoomUpdate(room);
    });

    // ─── LEAVE ROOM ─────────────────────────────────────────────────────────
    socket.on(C2S.LEAVE_ROOM, async () => {
      await leaveCurrentRoom(socket, io, engine, true);
    });

    // ─── SET READY ──────────────────────────────────────────────────────────
    socket.on(C2S.SET_READY, (payload: unknown) => {
      const parse = z.object({ roomCode: z.string(), ready: z.boolean() }).safeParse(payload);
      if (!parse.success) return;
      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = getPlayer(socket, room);
      if (!player) return;
      player.ready = parse.data.ready;
      broadcastRoomUpdate(room);
    });

    // ─── START GAME ─────────────────────────────────────────────────────────
    socket.on(C2S.START_GAME, async (payload: unknown) => {
      const parse = SimpleRoomSchema.safeParse(payload);
      if (!parse.success) return emitError(socket, ErrorCode.INVALID_PAYLOAD, "Invalid payload");
      const room = getPlayerRoom(socket);
      if (!room) return emitError(socket, ErrorCode.NOT_IN_ROOM, "Not in room");
      const player = getPlayer(socket, room);
      if (!player?.isHost) return emitError(socket, ErrorCode.NOT_HOST, "Not host");
      if (room.phase !== GamePhase.LOBBY) return emitError(socket, ErrorCode.INVALID_PHASE, "Not in lobby");
      if (room.connectedPlayers.length < 2) return emitError(socket, ErrorCode.NOT_ENOUGH_PLAYERS, "Need at least 2 players");

      await engine.startGame(room);
    });

    // ─── SELECT WORD ────────────────────────────────────────────────────────
    socket.on(C2S.SELECT_WORD, async (payload: unknown) => {
      const parse = SelectWordSchema.safeParse(payload);
      if (!parse.success) return emitError(socket, ErrorCode.INVALID_PAYLOAD, "Invalid payload");
      const room = getPlayerRoom(socket);
      if (!room) return;
      if (room.phase !== GamePhase.WORD_SELECTION) return emitError(socket, ErrorCode.INVALID_PHASE, "Not word selection phase");
      await engine.artistSelectWord(room, data.playerId, parse.data.word);
    });

    // ─── DRAWING EVENTS ──────────────────────────────────────────────────────
    socket.on(C2S.STROKE_START, (payload: unknown) => {
      const parse = StrokeStartSchema.safeParse(payload);
      if (!parse.success) return;
      handleDrawingEvent(socket, room => {
        const evt = { version: 1 as const, type: "strokeStart" as const, ...parse.data };
        room.addDrawingEvent({ type: "strokeStart", data: evt as Record<string, unknown>, sequenceNumber: parse.data.sequenceNumber, timestamp: Date.now() });
        socket.to(roomChannel(room.roomCode)).emit(S2C.STROKE_START, evt);
      });
    });

    socket.on(C2S.STROKE_BATCH, (payload: unknown) => {
      const parse = StrokeBatchSchema.safeParse(payload);
      if (!parse.success) return;
      handleDrawingEvent(socket, room => {
        const evt = { version: 1 as const, type: "strokeBatch" as const, ...parse.data };
        room.addDrawingEvent({ type: "strokeBatch", data: evt as Record<string, unknown>, sequenceNumber: parse.data.sequenceNumber, timestamp: Date.now() });
        socket.to(roomChannel(room.roomCode)).emit(S2C.STROKE_BATCH, evt);
      });
    });

    socket.on(C2S.STROKE_END, (payload: unknown) => {
      const parse = StrokeEndSchema.safeParse(payload);
      if (!parse.success) return;
      handleDrawingEvent(socket, room => {
        const evt = { version: 1 as const, type: "strokeEnd" as const, ...parse.data };
        room.addDrawingEvent({ type: "strokeEnd", data: evt as Record<string, unknown>, sequenceNumber: parse.data.sequenceNumber, timestamp: Date.now() });
        socket.to(roomChannel(room.roomCode)).emit(S2C.STROKE_END, evt);
      });
    });

    socket.on(C2S.CLEAR_CANVAS, (payload: unknown) => {
      const parse = z.object({ roomCode: z.string(), sequenceNumber: z.number().int() }).safeParse(payload);
      if (!parse.success) return;
      handleDrawingEvent(socket, room => {
        room.drawingHistory = [];
        room.addDrawingEvent({ type: "clearCanvas", data: {}, sequenceNumber: parse.data.sequenceNumber, timestamp: Date.now() });
        socket.to(roomChannel(room.roomCode)).emit(S2C.CANVAS_CLEARED, { version: 1, roomCode: room.roomCode });
      });
    });

    socket.on(C2S.UNDO_STROKE, (payload: unknown) => {
      const parse = z.object({ roomCode: z.string(), sequenceNumber: z.number().int() }).safeParse(payload);
      if (!parse.success) return;
      handleDrawingEvent(socket, room => {
        // Remove entire last stroke from history
        const lastStrokeEvt = [...room.drawingHistory].reverse().find(e => e.data && typeof e.data.strokeId === "string");
        if (lastStrokeEvt && lastStrokeEvt.data.strokeId) {
          const targetStrokeId = lastStrokeEvt.data.strokeId;
          room.drawingHistory = room.drawingHistory.filter(e => !e.data || e.data.strokeId !== targetStrokeId);
        }
        socket.to(roomChannel(room.roomCode)).emit(S2C.UNDO_STROKE, { version: 1, roomCode: room.roomCode });
      });
    });

    // ─── SUBMIT GUESS ────────────────────────────────────────────────────────
    socket.on(C2S.SUBMIT_GUESS, async (payload: unknown) => {
      const parse = SubmitGuessSchema.safeParse(payload);
      if (!parse.success) return;

      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = getPlayer(socket, room);
      if (!player) return;
      if (player.isMuted) return emitError(socket, ErrorCode.MUTED, "You are muted");
      if (!chatRateLimiter.consume(`chat:${data.playerId}`)) {
        return emitError(socket, ErrorCode.RATE_LIMITED, "Too many messages");
      }

      if (room.phase === GamePhase.DRAWING && room.currentRound?.artistId === player.playerId) {
        return emitError(socket, ErrorCode.INVALID_PAYLOAD, "Artist cannot submit guesses");
      }

      const guess = normalizeGuess(parse.data.guess);
      const result = await engine.submitGuess(room, player, guess);

      if (!result.correct) {
        // Broadcast incorrect guess as chat (may give clues via partially correct text, so we show original guess text)
        const chatMsg = {
          id: uuidv4(),
          playerId: player.playerId,
          nickname: player.nickname,
          text: parse.data.guess.slice(0, 200),
          isCorrectGuess: false,
          timestamp: Date.now(),
        };
        room.addChatMessage(chatMsg);
        io.to(roomChannel(room.roomCode)).emit(S2C.CHAT_MESSAGE, {
          version: 1,
          roomCode: room.roomCode,
          message: chatMsg,
        });
      }

      socket.emit(S2C.GUESS_RESULT, {
        version: 1,
        roomCode: room.roomCode,
        correct: result.correct,
        points: result.points ?? 0,
      });
    });

    // ─── CHAT MESSAGE ────────────────────────────────────────────────────────
    socket.on(C2S.CHAT_MESSAGE, async (payload: unknown) => {
      const parse = ChatMessageSchema.safeParse(payload);
      if (!parse.success) return;

      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = getPlayer(socket, room);
      if (!player) return;
      if (player.isMuted) return emitError(socket, ErrorCode.MUTED, "You are muted");
      if (!chatRateLimiter.consume(`chat:${data.playerId}`)) {
        return emitError(socket, ErrorCode.RATE_LIMITED, "Too many messages");
      }

      if (room.phase === GamePhase.DRAWING && room.currentRound) {
        const isArtist = room.currentRound.artistId === player.playerId;
        const normalizedText = normalizeGuess(parse.data.text);
        const normalizedAnswer = normalizeGuess(room.currentRound.secretWord);

        if (isArtist && normalizedText.includes(normalizedAnswer)) {
          return emitError(socket, ErrorCode.INVALID_PAYLOAD, "You cannot reveal the answer in chat!");
        }

        if (!isArtist && normalizedText === normalizedAnswer && !player.hasGuessedCurrentWord) {
           const result = await engine.submitGuess(room, player, parse.data.text);
           if (result.correct) {
              socket.emit(S2C.GUESS_RESULT, {
                  version: 1,
                  roomCode: room.roomCode,
                  correct: true,
                  points: result.points ?? 0,
              });
              return;
           }
        }
      }

      const chatMsg = {
        id: uuidv4(),
        playerId: player.playerId,
        nickname: player.nickname,
        text: parse.data.text.slice(0, 200),
        isCorrectGuess: false,
        timestamp: Date.now(),
      };

      let targetPlayers = room.playerList;
      if (room.phase === GamePhase.DRAWING && room.currentRound && player.hasGuessedCurrentWord) {
         chatMsg.isCorrectGuess = true;
         targetPlayers = room.playerList.filter(p => p.hasGuessedCurrentWord || p.playerId === room.currentRound!.artistId);
      }

      room.addChatMessage(chatMsg);

      const msgPayload = {
        version: 1,
        roomCode: room.roomCode,
        message: chatMsg,
      };

      if (targetPlayers.length === room.playerList.length) {
         io.to(roomChannel(room.roomCode)).emit(S2C.CHAT_MESSAGE, msgPayload);
      } else {
         for (const p of targetPlayers) {
            if (p.socketId) {
                io.sockets.sockets.get(p.socketId)?.emit(S2C.CHAT_MESSAGE, msgPayload);
            }
         }
      }
    });

    // ─── HOST: KICK / MUTE / BAN ─────────────────────────────────────────────
    socket.on(C2S.KICK_PLAYER, async (payload: unknown) => {
      const parse = PlayerActionSchema.safeParse(payload);
      if (!parse.success) return;
      await hostAction(socket, parse.data.targetPlayerId, async (room, target) => {
        target.connected = false;
        const targetSocket = io.sockets.sockets.get(target.socketId ?? "");
        targetSocket?.disconnect(true);
        io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_KICKED, {
          version: 1, roomCode: room.roomCode, playerId: target.playerId,
        });
        room.removePlayer(target.playerId);
        broadcastRoomUpdate(room);
      });
    });

    socket.on(C2S.MUTE_PLAYER, async (payload: unknown) => {
      const parse = PlayerActionSchema.safeParse(payload);
      if (!parse.success) return;
      await hostAction(socket, parse.data.targetPlayerId, async (room, target) => {
        target.isMuted = !target.isMuted;
        io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_MUTED, {
          version: 1, roomCode: room.roomCode, playerId: target.playerId, muted: target.isMuted,
        });
      });
    });

    socket.on(C2S.BAN_PLAYER, async (payload: unknown) => {
      const parse = PlayerActionSchema.safeParse(payload);
      if (!parse.success) return;
      await hostAction(socket, parse.data.targetPlayerId, async (room, target) => {
        target.isBanned = true;
        target.connected = false;
        const targetSocket = io.sockets.sockets.get(target.socketId ?? "");
        targetSocket?.disconnect(true);
        io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_BANNED, {
          version: 1, roomCode: room.roomCode, playerId: target.playerId,
        });
        // Keep in room as banned; don't remove so ban persists
        broadcastRoomUpdate(room);
      });
    });

    // ─── REQUEST STATE ───────────────────────────────────────────────────────
    socket.on(C2S.REQUEST_STATE, () => {
      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = getPlayer(socket, room);
      if (!player) return;
      const state = engine.buildReconnectState(room, player);
      socket.emit(S2C.RECONNECT_STATE, state);
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      logger.debug({ socketId: socket.id, playerId: data.playerId }, "Socket disconnected");
      const room = getPlayerRoom(socket);
      if (!room) return;

      const player = room.players.get(data.playerId);
      if (!player) return;

      if (player.socketId !== socket.id) {
        logger.debug({ socketId: socket.id, activeSocketId: player.socketId }, "Ignoring stale socket disconnect");
        return;
      }

      player.connected = false;
      player.disconnectedAt = Date.now();
      if (!player.disconnectTimers) player.disconnectTimers = [];

      io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_LEFT, {
        version: 1,
        roomCode: room.roomCode,
        playerId: data.playerId,
        nickname: player.nickname,
        temporary: true,
        serverTime: Date.now(),
      });
      broadcastRoomUpdate(room);

      // Host migration grace period
      if (player.isHost) {
        player.disconnectTimers.push(setTimeout(() => {
          if (!player.connected && room.players.has(data.playerId)) {
            const newHost = engine.migrateHost(room);
            if (newHost) {
              io.to(roomChannel(room.roomCode)).emit(S2C.HOST_CHANGED, {
                version: 1, roomCode: room.roomCode, newHostId: newHost.playerId,
              });
              broadcastRoomUpdate(room);
            }
          }
        }, config.HOST_MIGRATE_GRACE_MS));
      }

      // Artist disconnect grace period
      if ((room.phase === GamePhase.DRAWING || room.phase === GamePhase.WORD_SELECTION) && room.currentRound?.artistId === data.playerId) {
        player.disconnectTimers.push(setTimeout(async () => {
          if (!player.connected && (room.phase === GamePhase.DRAWING || room.phase === GamePhase.WORD_SELECTION) && room.currentRound?.artistId === data.playerId) {
            await engine.endRound(room, "artistDisconnected");
          }
        }, config.ARTIST_DISCONNECT_GRACE_MS));
      }

      // Permanent removal grace period
      player.disconnectTimers.push(setTimeout(() => {
        if (!player.connected && room.players.has(data.playerId)) {
          room.removePlayer(data.playerId);
          io.to(roomChannel(room.roomCode)).emit(S2C.PLAYER_LEFT, {
            version: 1, roomCode: room.roomCode, playerId: data.playerId, temporary: false,
          });
          broadcastRoomUpdate(room);
          if (room.players.size === 0) roomStore.delete(room.roomCode);
        }
      }, config.DISCONNECT_GRACE_MS));
    });

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function handleDrawingEvent(sock: Socket, handler: (room: Room) => void) {
      const room = getPlayerRoom(sock);
      if (!room) return;
      const player = getPlayer(sock, room);
      if (!player) return;
      if (room.phase !== GamePhase.DRAWING) return;
      if (room.currentRound?.artistId !== data.playerId) return;
      if (!drawRateLimiter.consume(`draw:${data.playerId}`)) return;
      handler(room);
    }

    async function hostAction(
      sock: Socket,
      targetId: string,
      fn: (room: Room, target: ServerPlayer) => Promise<void>
    ) {
      const room = getPlayerRoom(sock);
      if (!room) return;
      const actor = getPlayer(sock, room);
      if (!actor?.isHost) return emitError(sock, ErrorCode.NOT_HOST, "Not host");
      if (targetId === data.playerId) return; // Can't kick yourself
      const target = room.players.get(targetId);
      if (!target) return emitError(sock, ErrorCode.NOT_IN_ROOM, "Target not found");
      await fn(room, target);
    }
  });

  // ─── Shared helpers ───────────────────────────────────────────────────────

  async function leaveCurrentRoom(
    socket: Socket,
    io: SocketServer,
    engine: GameEngine,
    explicit = false
  ): Promise<void> {
    const data = socket.data as SocketData;
    if (!data.currentRoomCode) return;
    const room = roomStore.get(data.currentRoomCode);
    if (!room) {
      data.currentRoomCode = null;
      return;
    }
    const player = room.players.get(data.playerId);
    if (player) {
      if (explicit) {
        room.removePlayer(data.playerId);
        // Artist explicitly left during active round:
        if ((room.phase === GamePhase.DRAWING || room.phase === GamePhase.WORD_SELECTION) && room.currentRound?.artistId === data.playerId) {
          await engine.endRound(room, "artistDisconnected");
        }
        io.to(`room:${room.roomCode}`).emit(S2C.PLAYER_LEFT, {
          version: 1, roomCode: room.roomCode, playerId: data.playerId, temporary: false,
        });
        // Migrate host if needed
        if (player.isHost) {
          const newHost = engine.migrateHost(room);
          if (newHost) {
            io.to(`room:${room.roomCode}`).emit(S2C.HOST_CHANGED, {
              version: 1, roomCode: room.roomCode, newHostId: newHost.playerId,
            });
          }
        }
        if (room.players.size === 0) roomStore.delete(room.roomCode);
        else {
          io.to(`room:${room.roomCode}`).emit(S2C.ROOM_UPDATED, {
            version: 1,
            roomCode: room.roomCode,
            phase: room.phase,
            players: room.playerList.map((p) => room.getPublicPlayerState(p)),
            serverTime: Date.now(),
          });
        }
      }
    }
    socket.leave(`room:${room.roomCode}`);
    data.currentRoomCode = null;
  }
}
