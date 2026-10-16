import type { Socket, Server as SocketServer } from "socket.io";
import { friendStore } from "../db/friendStore.js";
import { userStore } from "../db/userStore.js";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import type { User } from "../db/models.js";

const TargetTagSchema = z.object({ targetTag: z.string() });
const RequestIdSchema = z.object({ requestId: z.string() });
const FriendIdSchema = z.object({ friendId: z.string() });

export function registerFriendHandlers(io: SocketServer, socket: Socket, dbUser: User) {
  
  const emitError = (code: string, message: string) => {
    socket.emit("error", { code, message, version: 1 });
  };

  const notifyUser = (userId: string, eventName: string, payload: any) => {
    io.to(`user:${userId}`).emit(eventName, payload);
  };

  socket.on("getFriends", async () => {
    try {
      const friendshipsSnap = await friendStore.getFriendships(dbUser.id);
      const requestsSnap = await friendStore.getPendingRequests(dbUser.id);

      const friends = [];
      for (const f of friendshipsSnap) {
        const friendId = f.user1Id === dbUser.id ? f.user2Id : f.user1Id;
        const friend = await userStore.findById(friendId);
        if (friend) {
          friends.push({ id: friend.id, tag: friend.uniqueTag, name: friend.displayName, avatar: friend.avatarUrl });
        }
      }

      const sentRequests = [];
      const incomingRequests = [];
      for (const r of requestsSnap) {
        if (r.status !== "PENDING") continue;
        
        if (r.senderId === dbUser.id) {
          const receiver = await userStore.findById(r.receiverId);
          if (receiver) {
            sentRequests.push({ id: r.id, receiverId: receiver.id, tag: receiver.uniqueTag, name: receiver.displayName, avatar: receiver.avatarUrl });
          }
        } else if (r.receiverId === dbUser.id) {
          const sender = await userStore.findById(r.senderId);
          if (sender) {
            incomingRequests.push({ id: r.id, senderId: sender.id, tag: sender.uniqueTag, name: sender.displayName, avatar: sender.avatarUrl });
          }
        }
      }

      socket.emit("friendsList", { friends, sentRequests, incomingRequests });
    } catch (e) {
      logger.error({ err: e }, "Failed to get friends");
    }
  });

  socket.on("addFriend", async (payload: unknown) => {
    try {
      const parse = TargetTagSchema.safeParse(payload);
      if (!parse.success) return emitError("INVALID_PAYLOAD", "Invalid target tag");
      
      const targetTag = parse.data.targetTag.trim().toUpperCase();
      if (targetTag === dbUser.uniqueTag.toUpperCase()) {
        return emitError("INVALID_ACTION", "You cannot add yourself.");
      }

      const target = await userStore.findByUniqueTag(targetTag);
      if (!target) return emitError("USER_NOT_FOUND", "User not found.");

      const friendshipSnap = await friendStore.getFriendship(dbUser.id, target.id);
      
      if (friendshipSnap) return emitError("ALREADY_FRIENDS", "You are already friends.");

      const existingReqSnap = await friendStore.getPendingRequest(dbUser.id, target.id);
      
      if (existingReqSnap) return emitError("REQUEST_EXISTS", "A pending request already exists.");

      const reqId = await friendStore.createRequest(dbUser.id, target.id);

      socket.emit("friendRequestSent", { id: reqId, receiverId: target.id, tag: target.uniqueTag, name: target.displayName, avatar: target.avatarUrl });
      
      notifyUser(target.id, "friendRequestReceived", {
        id: reqId,
        senderId: dbUser.id,
        tag: dbUser.uniqueTag,
        name: dbUser.displayName,
        avatar: dbUser.avatarUrl
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to add friend");
      emitError("SERVER_ERROR", "Internal error");
    }
  });

  socket.on("acceptFriend", async (payload: unknown) => {
    try {
      const parse = RequestIdSchema.safeParse(payload);
      if (!parse.success) return emitError("INVALID_PAYLOAD", "Invalid request ID");

      const req = await friendStore.getRequest(parse.data.requestId);
      
      if (!req) return emitError("INVALID_ACTION", "Request not found.");
      
      if (req.receiverId !== dbUser.id || req.status !== "PENDING") {
        return emitError("INVALID_ACTION", "Request not found or already processed.");
      }

      await friendStore.acceptRequest(req.id, req);

      const sender = await userStore.findById(req.senderId);
      if (sender) {
        socket.emit("friendAdded", { id: sender.id, tag: sender.uniqueTag, name: sender.displayName, avatar: sender.avatarUrl });
        notifyUser(req.senderId, "friendAdded", { id: dbUser.id, tag: dbUser.uniqueTag, name: dbUser.displayName, avatar: dbUser.avatarUrl });
      }
    } catch (e) {
      logger.error({ err: e }, "Failed to accept friend");
    }
  });

  socket.on("rejectFriend", async (payload: unknown) => {
    try {
      const parse = RequestIdSchema.safeParse(payload);
      if (!parse.success) return;
      const req = await friendStore.getRequest(parse.data.requestId);
      
      if (req) {
        if (req.receiverId === dbUser.id) {
          await friendStore.deleteRequest(req.id);
          socket.emit("friendRequestRemoved", { requestId: req.id });
          notifyUser(req.senderId, "friendRequestRemoved", { requestId: req.id });
        }
      }
    } catch (e) {}
  });

  socket.on("cancelFriendRequest", async (payload: unknown) => {
    try {
      const parse = RequestIdSchema.safeParse(payload);
      if (!parse.success) return;
      const req = await friendStore.getRequest(parse.data.requestId);
      
      if (req) {
        if (req.senderId === dbUser.id) {
          await friendStore.deleteRequest(req.id);
          socket.emit("friendRequestRemoved", { requestId: req.id });
          notifyUser(req.receiverId, "friendRequestRemoved", { requestId: req.id });
        }
      }
    } catch (e) {}
  });

  socket.on("removeFriend", async (payload: unknown) => {
    try {
      const parse = FriendIdSchema.safeParse(payload);
      if (!parse.success) return;
      const targetId = parse.data.friendId;

      await friendStore.deleteFriendship(dbUser.id, targetId);
      socket.emit("friendRemoved", { friendId: targetId });
      notifyUser(targetId, "friendRemoved", { friendId: dbUser.id });
    } catch (e) {}
  });
}
