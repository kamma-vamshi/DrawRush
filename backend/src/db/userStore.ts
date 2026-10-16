import { User } from "./models.js";
import { db } from "../auth/firebase.js";
import { config } from "../config/config.js";
import { v4 as uuidv4 } from "uuid";

export interface UserStore {
  findByGoogleId(googleId: string): Promise<User | null>;
  findByUniqueTag(uniqueTag: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  createUser(googleId: string, name: string, picture: string): Promise<User>;
}

class FirestoreUserStore implements UserStore {
  async findByGoogleId(googleId: string): Promise<User | null> {
    const snap = await db.collection("users").where("googleId", "==", googleId).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as User;
  }

  async findByUniqueTag(uniqueTag: string): Promise<User | null> {
    const snap = await db.collection("users").where("uniqueTag", "==", uniqueTag).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as User;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await db.collection("users").doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as User;
  }

  async createUser(googleId: string, name: string, picture: string): Promise<User> {
    let baseName = (name || "Player").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (!baseName) baseName = "PLAYER";
    let uniqueTag = `${baseName}#${Math.floor(1000 + Math.random() * 9000)}`;
    
    let existing = await this.findByUniqueTag(uniqueTag);
    while (existing) {
        uniqueTag = `${baseName}#${Math.floor(1000 + Math.random() * 9000)}`;
        existing = await this.findByUniqueTag(uniqueTag);
    }

    const docRef = db.collection("users").doc();
    const now = new Date();
    const user: User = {
        id: docRef.id,
        googleId,
        uniqueTag,
        displayName: name || "Player",
        avatarUrl: picture || "avatar_01",
        createdAt: now,
        updatedAt: now,
    };
    await docRef.set(user);
    return user;
  }
}

class InMemoryUserStore implements UserStore {
  private users = new Map<string, User>();
  private googleIdMap = new Map<string, string>();
  private uniqueTagMap = new Map<string, string>();

  async findByGoogleId(googleId: string): Promise<User | null> {
    const id = this.googleIdMap.get(googleId);
    return id ? this.users.get(id) || null : null;
  }

  async findByUniqueTag(uniqueTag: string): Promise<User | null> {
    const id = this.uniqueTagMap.get(uniqueTag);
    return id ? this.users.get(id) || null : null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(googleId: string, name: string, picture: string): Promise<User> {
    let baseName = (name || "Player").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (!baseName) baseName = "PLAYER";
    let uniqueTag = `${baseName}#${Math.floor(1000 + Math.random() * 9000)}`;
    
    while (this.uniqueTagMap.has(uniqueTag)) {
        uniqueTag = `${baseName}#${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const id = uuidv4();
    const now = new Date();
    const user: User = {
        id,
        googleId,
        uniqueTag,
        displayName: name || "Player",
        avatarUrl: picture || "avatar_01",
        createdAt: now,
        updatedAt: now,
    };
    
    this.users.set(id, user);
    this.googleIdMap.set(googleId, id);
    this.uniqueTagMap.set(uniqueTag, id);
    
    return user;
  }
}

export const userStore: UserStore = config.DEV_AUTH ? new InMemoryUserStore() : new FirestoreUserStore();
