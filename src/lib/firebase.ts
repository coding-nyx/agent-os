import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, initializeFirestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let storage: FirebaseStorage | undefined;

export function getFirebase() {
  if (!app) {
    try {
      console.log("[FIREBASE_INIT] Keys present:", !!firebaseConfig.apiKey, "Project:", firebaseConfig.projectId);
      // Check if config is valid
      if (!firebaseConfig.apiKey) {
        console.warn("Firebase API Key is missing. Firebase features will be disabled.");
        return { app: null, db: null, auth: null, storage: null };
      }
      const isFirstInit = !getApps().length;
      app = isFirstInit ? initializeApp(firebaseConfig) : getApp();
      // experimentalAutoDetectLongPolling prevents 400 errors on the Write/channel
      // by automatically falling back from WebSockets to HTTP long-polling when needed.
      db = isFirstInit
        ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
        : getFirestore(app);
      auth = getAuth(app);
      storage = getStorage(app);
    } catch (e) {
      console.error("Firebase Initialization Error:", e);
      // Don't throw, just return nulls to allow app to run in mock mode
      return { app: null, db: null, auth: null, storage: null };
    }
  }
  return { app, db, auth, storage };
}

/**
 * Ensures that the Firebase Auth token is fully propagated before proceeding.
 * This prevents "Missing or insufficient permissions" errors when querying Firestore immediately after login.
 */
export async function ensureAuthReady(): Promise<void> {
  const { auth } = getFirebase();
  if (!auth) return;

  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn("Failed to get ID token", e);
    }
    return;
  }

  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      if (user) {
        try {
          await user.getIdToken();
        } catch (e) { console.warn('Failed to fetch app check token:', e); }
      }
      resolve();
    });
  });
}
