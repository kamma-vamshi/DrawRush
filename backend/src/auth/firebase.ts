import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";

let firebaseApp: App;
export let db: Firestore;

export function initFirebase(): void {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    db = getFirestore(firebaseApp);
    return;
  }

  if (config.DEV_AUTH) {
    logger.warn(
      "⚠️  DEV_AUTH=true — Firebase token verification is DISABLED. " +
      "Never use this in production."
    );
    return;
  }

  if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_CLIENT_EMAIL || !config.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "FATAL: Firebase credentials missing (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) " +
      "and DEV_AUTH=false. Cannot start backend without authentication credentials."
    );
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });

  db = getFirestore(firebaseApp);
  logger.info({ projectId: config.FIREBASE_PROJECT_ID }, "Firebase Admin initialized");
}

/**
 * Verify a Firebase ID token and return the UID.
 * In DEV_AUTH mode, accept a token in the format "dev:<uid>:<nickname>"
 * and return the uid portion. This allows testing without a real Firebase project.
 */
export async function verifyIdToken(
  token: string
): Promise<{ uid: string; email?: string; name?: string; picture?: string; devMode: boolean }> {
  if (config.DEV_AUTH) {
    if (!token.startsWith("dev:")) {
      throw new Error("INVALID_TOKEN: In DEV_AUTH mode use token format 'dev:<uid>'");
    }
    const uid = token.slice(4);
    if (!uid || uid.length === 0) {
      throw new Error("INVALID_TOKEN: Empty UID in dev token");
    }
    // Mock user data for dev mode
    return { uid, name: "Dev User", email: `dev_${uid}@example.com`, picture: "avatar_01", devMode: true };
  }

  const decodedToken = await getAuth(firebaseApp).verifyIdToken(token, true);
  return { 
    uid: decodedToken.uid, 
    email: decodedToken.email,
    name: decodedToken.name,
    picture: decodedToken.picture,
    devMode: false 
  };
}
