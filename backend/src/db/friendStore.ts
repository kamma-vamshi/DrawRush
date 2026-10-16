import { FriendRequest, Friendship } from "./models.js";
import { db } from "../auth/firebase.js";
import { config } from "../config/config.js";
import { v4 as uuidv4 } from "uuid";
import { Filter } from "firebase-admin/firestore";

export interface FriendStore {
  getFriendships(userId: string): Promise<Friendship[]>;
  getPendingRequests(userId: string): Promise<FriendRequest[]>;
  getFriendship(user1Id: string, user2Id: string): Promise<Friendship | null>;
  getPendingRequest(user1Id: string, user2Id: string): Promise<FriendRequest | null>;
  getRequest(requestId: string): Promise<FriendRequest | null>;
  createRequest(senderId: string, receiverId: string): Promise<string>;
  acceptRequest(requestId: string, req: FriendRequest): Promise<void>;
  deleteRequest(requestId: string): Promise<void>;
  deleteFriendship(user1Id: string, user2Id: string): Promise<void>;
}

class FirestoreFriendStore implements FriendStore {
  async getFriendships(userId: string): Promise<Friendship[]> {
    const snap = await db.collection("friendships").where(
      Filter.or(Filter.where("user1Id", "==", userId), Filter.where("user2Id", "==", userId))
    ).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Friendship));
  }

  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    const snap = await db.collection("friendRequests").where("status", "==", "PENDING").where(
      Filter.or(Filter.where("senderId", "==", userId), Filter.where("receiverId", "==", userId))
    ).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
  }

  async getFriendship(user1Id: string, user2Id: string): Promise<Friendship | null> {
    const snap = await db.collection("friendships").where(
      Filter.or(
        Filter.and(Filter.where("user1Id", "==", user1Id), Filter.where("user2Id", "==", user2Id)),
        Filter.and(Filter.where("user1Id", "==", user2Id), Filter.where("user2Id", "==", user1Id))
      )
    ).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as Friendship;
  }

  async getPendingRequest(user1Id: string, user2Id: string): Promise<FriendRequest | null> {
    const snap = await db.collection("friendRequests").where("status", "==", "PENDING").where(
      Filter.or(
        Filter.and(Filter.where("senderId", "==", user1Id), Filter.where("receiverId", "==", user2Id)),
        Filter.and(Filter.where("senderId", "==", user2Id), Filter.where("receiverId", "==", user1Id))
      )
    ).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as FriendRequest;
  }

  async getRequest(requestId: string): Promise<FriendRequest | null> {
    const doc = await db.collection("friendRequests").doc(requestId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as FriendRequest;
  }

  async createRequest(senderId: string, receiverId: string): Promise<string> {
    const reqRef = db.collection("friendRequests").doc();
    await reqRef.set({
      id: reqRef.id,
      senderId,
      receiverId,
      status: "PENDING",
      createdAt: new Date()
    });
    return reqRef.id;
  }

  async acceptRequest(requestId: string, req: FriendRequest): Promise<void> {
    const batch = db.batch();
    const reqRef = db.collection("friendRequests").doc(requestId);
    const friendshipRef = db.collection("friendships").doc();
    
    batch.update(reqRef, { status: "ACCEPTED" });
    batch.set(friendshipRef, {
      id: friendshipRef.id,
      user1Id: req.senderId,
      user2Id: req.receiverId,
      createdAt: new Date()
    });
    
    await batch.commit();
  }

  async deleteRequest(requestId: string): Promise<void> {
    await db.collection("friendRequests").doc(requestId).delete();
  }

  async deleteFriendship(user1Id: string, user2Id: string): Promise<void> {
    const snap = await db.collection("friendships").where(
      Filter.or(
        Filter.and(Filter.where("user1Id", "==", user1Id), Filter.where("user2Id", "==", user2Id)),
        Filter.and(Filter.where("user1Id", "==", user2Id), Filter.where("user2Id", "==", user1Id))
      )
    ).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.delete();
    }
  }
}

class InMemoryFriendStore implements FriendStore {
  private requests = new Map<string, FriendRequest>();
  private friendships = new Map<string, Friendship>();

  async getFriendships(userId: string): Promise<Friendship[]> {
    return Array.from(this.friendships.values()).filter(f => f.user1Id === userId || f.user2Id === userId);
  }

  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    return Array.from(this.requests.values()).filter(r => r.status === "PENDING" && (r.senderId === userId || r.receiverId === userId));
  }

  async getFriendship(user1Id: string, user2Id: string): Promise<Friendship | null> {
    return Array.from(this.friendships.values()).find(f => 
      (f.user1Id === user1Id && f.user2Id === user2Id) || (f.user1Id === user2Id && f.user2Id === user1Id)
    ) || null;
  }

  async getPendingRequest(user1Id: string, user2Id: string): Promise<FriendRequest | null> {
    return Array.from(this.requests.values()).find(r => 
      r.status === "PENDING" && ((r.senderId === user1Id && r.receiverId === user2Id) || (r.senderId === user2Id && r.receiverId === user1Id))
    ) || null;
  }

  async getRequest(requestId: string): Promise<FriendRequest | null> {
    return this.requests.get(requestId) || null;
  }

  async createRequest(senderId: string, receiverId: string): Promise<string> {
    const id = uuidv4();
    this.requests.set(id, {
      id,
      senderId,
      receiverId,
      status: "PENDING",
      createdAt: new Date()
    });
    return id;
  }

  async acceptRequest(requestId: string, req: FriendRequest): Promise<void> {
    const existing = this.requests.get(requestId);
    if (existing) {
      existing.status = "ACCEPTED";
    }
    const id = uuidv4();
    this.friendships.set(id, {
      id,
      user1Id: req.senderId,
      user2Id: req.receiverId,
      createdAt: new Date()
    });
  }

  async deleteRequest(requestId: string): Promise<void> {
    this.requests.delete(requestId);
  }

  async deleteFriendship(user1Id: string, user2Id: string): Promise<void> {
    const f = await this.getFriendship(user1Id, user2Id);
    if (f) this.friendships.delete(f.id);
  }
}

export const friendStore: FriendStore = config.DEV_AUTH ? new InMemoryFriendStore() : new FirestoreFriendStore();
