import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Normalize storage bucket domain: must be *.appspot.com for Firebase SDK
const rawBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
if (!rawBucket) {
  throw new Error('VITE_FIREBASE_STORAGE_BUCKET environment variable is required');
}
const normalizedBucket = rawBucket.replace(/\.firebasestorage\.app$/i, '.appspot.com');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: normalizedBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate required Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Firebase configuration is missing. Please set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID environment variables.');
}


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
// Explicitly bind storage to the bucket using gs:// to avoid host resolution/CORS quirks
export const storage = getStorage(app, `gs://${normalizedBucket}`);

// Suppress Firebase console errors globally
if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  const shouldIgnore = (msg: string): boolean => {
    return msg.includes('permission-denied') || 
           msg.includes('Missing or insufficient permissions') ||
           msg.includes('Firestore') ||
           msg.includes('FIRESTORE') ||
           msg.includes('Unexpected state') ||
           msg.includes('INTERNAL ASSERTION') ||
           msg.includes('Bad Request') ||
           msg.includes('terminate&zx=') ||
           msg.includes('Unauthorized') ||
           msg.includes('configuration-not-found') ||
           msg.includes('operation-not-allowed') ||
           msg.includes('Anonymous auth not enabled');
  };
  
  console.error = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalError(...args);
  };
  
  console.warn = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalWarn(...args);
  };
  
  // Also suppress defaultLogHandler from Firestore
  console.log = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalLog(...args);
  };
}

export default app;
