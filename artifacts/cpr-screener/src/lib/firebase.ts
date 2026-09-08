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
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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

/** Shared Firestore instance. Lazily created on first use. */
export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
  }
  return dbInstance;
}

function getAuthInstance(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

let signInPromise: Promise<string> | null = null;

/**
 * Ensures the current browser has a signed-in (anonymous) Firebase user
 * and resolves with its uid. Safe to call repeatedly — concurrent/
 * repeated calls reuse the same in-flight or completed sign-in rather
 * than re-authenticating each time.
 */
export function ensureSignedIn(): Promise<string> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ensureSignedIn can only run in the browser"));
  }
  if (signInPromise) return signInPromise;

  const auth = getAuthInstance();
  signInPromise = new Promise<string>((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser.uid);
      return;
    }
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user.uid);
        }
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
    signInAnonymously(auth).catch((err) => {
      unsubscribe();
      reject(err);
    });
  });
  return signInPromise;
}