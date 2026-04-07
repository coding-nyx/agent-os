import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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
      // experimentalAutoDetectLongPolling prevents 400 errors on the Write/channel
      // by automatically falling back from WebSockets to HTTP long-polling when needed.
      db = isFirstInit
        ? initializeFirestore(app, {
            experimentalAutoDetectLongPolling: true,
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


