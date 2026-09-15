/**
 * Firebase app/auth/Firestore bootstrap — single shared instance for the
 * whole app. Config values below are public-safe (they identify the
 * project, not a secret); what actually secures the data is the
 * Firestore security rules, which restrict every chartLinks read/write
 * to the signed-in browser's own uid.
 *
 * Anonymous Auth (not a real login/sign-up flow) is what gives each
 * browser a stable uid to scope chartLinks documents by, with no
 * sign-in UI needed. Runs on the free Spark plan — no linked card.
 *
 * Vite (not Next.js) builds this project, so config comes from
 * import.meta.env.VITE_* — only vars prefixed VITE_ are exposed to
 * browser code — rather than process.env.NEXT_PUBLIC_*.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  setLogLevel,
  type Firestore,
} from "firebase/firestore";

// Suppress Firestore SDK internal connection state warnings (e.g. offline fallback warnings in iframe/sandboxes)
try {
  setLogLevel("silent");
} catch {
  // non-blocking
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Shared Firestore instance.
 * Uses memoryLocalCache and experimentalForceLongPolling to prevent
 * WebChannel stream disconnects ("Could not reach Cloud Firestore backend")
 * and IndexedDB lockups in sandboxed iframes/browsers.
 */
export function getDb(): Firestore {
  if (!dbInstance) {
    const fbApp = getFirebaseApp();
    try {
      dbInstance = initializeFirestore(fbApp, {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
      });
    } catch {
      dbInstance = getFirestore(fbApp);
    }
  }
  return dbInstance;
}

/**
 * Auth instance configured with browserLocalPersistence (localStorage),
 * session, and memory persistence.
 * Avoids indexedDBLocalPersistence which throws "Database is closing"
 * when pagehide or tab visibility events fire in iframes/background tabs.
 */
function getAuthInstance(): Auth {
  if (!authInstance) {
    const fbApp = getFirebaseApp();
    try {
      authInstance = initializeAuth(fbApp, {
        persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      });
    } catch {
      authInstance = getAuth(fbApp);
    }
  }
  return authInstance;
}

const OFFLINE_UID_KEY = "cpr-firebase-offline-uid";

function getOfflineFallbackUid(): string {
  try {
    const stored = localStorage.getItem(OFFLINE_UID_KEY);
    if (stored) return stored;
    const generated = "anon-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(OFFLINE_UID_KEY, generated);
    return generated;
  } catch {
    return "anon-session-fallback";
  }
}

let signInPromise: Promise<string> | null = null;

/**
 * Ensures the current browser has a signed-in (anonymous) Firebase user
 * and resolves with its uid. Safe to call repeatedly — concurrent/
 * repeated calls reuse the same in-flight or completed sign-in.
 * If offline or backend unreachable, gracefully resolves with a stable local anonymous uid
 * so the application continues to function without throwing unhandled exceptions.
 */
export function ensureSignedIn(): Promise<string> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ensureSignedIn can only run in the browser"));
  }

  const auth = getAuthInstance();
  if (auth.currentUser?.uid) {
    return Promise.resolve(auth.currentUser.uid);
  }

  if (signInPromise) return signInPromise;

  signInPromise = new Promise<string>((resolve) => {
    if (auth.currentUser?.uid) {
      resolve(auth.currentUser.uid);
      return;
    }

    let settled = false;
    const finish = (uid: string) => {
      if (!settled) {
        settled = true;
        unsubscribe();
        resolve(uid);
      }
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user?.uid) {
          finish(user.uid);
        }
      },
      () => {
        finish(getOfflineFallbackUid());
      }
    );

    signInAnonymously(auth)
      .then((cred) => {
        if (cred.user?.uid) {
          finish(cred.user.uid);
        }
      })
      .catch(() => {
        finish(getOfflineFallbackUid());
      });

    // Safety timeout: if auth takes longer than 3 seconds (e.g. offline/network stall),
    // resolve with fallback UID so downstream callers never hang
    setTimeout(() => {
      finish(getOfflineFallbackUid());
    }, 3000);
  }).catch(() => {
    signInPromise = null;
    return getOfflineFallbackUid();
  });

  return signInPromise;
}