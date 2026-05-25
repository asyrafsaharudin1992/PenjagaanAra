import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocFromServer,
  enableMultiTabIndexedDbPersistence,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const config = firebaseConfig as any;

// Explicitly check configuration
if (!config.apiKey || !config.projectId) {
  console.error("Firebase Configuration is missing critical fields. Please check your setup in firebase-applet-config.json.");
} else {
  console.log(`Connecting to Firebase Project: ${config.projectId}`);
  console.log(`Using Firestore Database ID: ${config.firestoreDatabaseId || '(default)'}`);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set persistence explicitly to browserLocalPersistence
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

// Initialize Firestore with long polling enabled to bypass corporate firewalls/proxies
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, config.firestoreDatabaseId || undefined);

/**
 * Enable Offline Persistence for Firestore
 * NOTE: enableMultiTabIndexedDbPersistence can sometimes wait indefinitely if 
 * previous tab sessions are hanging.
 */
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore persistence notice: Multiple tabs open. Persistence is active in another tab.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore persistence notice: Browser not supported for local storage.");
    } else {
      console.error("Firestore persistence error:", err);
    }
  });
}

// For creating users without logging out
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
export const secondaryAuth = getAuth(secondaryApp);

export { createUserWithEmailAndPassword, sendPasswordResetEmail };

// Error handling for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  // Log detailed error to console for engineering
  console.error('[Firestore Error Detail]:', JSON.stringify(errInfo, null, 2));

  // Throw a descriptive error to be caught by UI or toast
  if (errorMessage.includes('Insufficient permissions') || errorMessage.includes('permission-denied')) {
    throw new Error("You don't have permission to perform this action. Your account role may have changed.");
  } else if (errorMessage.includes('offline') || errorMessage.includes('Could not reach')) {
    throw new Error("Connectivity issue. Please check your internet or disable VPN/Ad-blocker for this site.");
  }
  
  throw new Error(errorMessage);
}

// Test connection with a timeout
async function testConnection() {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Connection timed out after 10s')), 10000)
  );

  try {
    // Attempt a cold-start reach to server
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise
    ]);
    console.log("Firestore connection test: SUCCESS");
  } catch (error: any) {
    console.warn("Firestore connection test: FAILED or TIMED OUT");
    if (error.message.includes('offline') || error.message.includes('timed out')) {
      console.error("CRITICAL: AraCare could not reach the database. Possible causes:");
      console.error("1. VPN or Ad-blocker is blocking firestore.googleapis.com");
      console.error("2. Corporate firewall restrictions.");
      console.error("3. Incorrect databaseId in firebase-applet-config.json");
      console.error("4. Device is currently offline.");
    }
  }
}

// Only run test if we're in a browser environment
if (typeof window !== 'undefined') {
  testConnection();
}
