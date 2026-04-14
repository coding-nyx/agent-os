import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  disableNetwork,
  enableNetwork,
} from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Eagerly evaluate availability so callers never need to call getFirebase() just
// to check config — getFirebase() has Firestore-initialisation side-effects.
const _firebaseAvailable = !!firebaseConfig.apiKey;

/** Returns true when all required Firebase environment variables are present. */
export function isFirebaseAvailable(): boolean {
  return _firebaseAvailable;
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let storage: FirebaseStorage | undefined;

export function getFirebase() {
  if (!app) {
    try {
      // Check if config is valid
      if (!firebaseConfig.apiKey) {
        console.warn("Firebase API Key is missing. Firebase features will be disabled.");
        return { app: null, db: null, auth: null, storage: null };
      }
      console.log("[Firebase] Initializing with projectId:", firebaseConfig.projectId);
      const isFirstInit = !getApps().length;
      app = isFirstInit ? initializeApp(firebaseConfig) : getApp();
      console.log("[Firebase] App initialized:", app?.name);
      // SDK v12 defaults to WebSocket transport with native long-polling
      // fallback — no experimental flags needed.
      db = isFirstInit
        ? initializeFirestore(app, {
            ignoreUndefinedProperties: true,
            localCache: persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
          })
        : getFirestore(app);
      console.log("[Firebase] Firestore initialized:", !!db);
      auth = getAuth(app);
      console.log("[Firebase] Auth initialized:", !!auth);
      storage = getStorage(app);
      console.log("[Firebase] Storage initialized:", !!storage);
    } catch (e) {
      console.error("Firebase Initialization Error:", e);
      // Don't throw, just return nulls to allow app to run in mock mode
      return { app: null, db: null, auth: null, storage: null };
    }
  }
  return { app, db, auth, storage };
}

// ── Firestore connection recovery ─────────────────────────────────────────
// When the SDK's long-polling channel hangs (no response for Listen/channel),
// toggling the network forces it to drop stuck connections and re-establish.
// Debounced so multiple callers (auth, vault, soul, module) don't trigger
// simultaneous reconnects within the same window.
let _reconnectInFlight = false;

export async function reconnectFirestore(): Promise<void> {
  if (_reconnectInFlight) return;
  const { db: firestoreDb } = getFirebase();
  if (!firestoreDb) return;

  _reconnectInFlight = true;
  try {
    console.warn('[Firebase] reconnectFirestore — cycling network to recover stuck channels');
    await disableNetwork(firestoreDb);
    await enableNetwork(firestoreDb);
  } catch (e) {
    console.error('[Firebase] reconnectFirestore failed:', e);
  } finally {
    _reconnectInFlight = false;
  }
}

