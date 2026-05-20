import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// TODO: Replace with your actual Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDEIuLRlI3H-lnYMG2fIvjzpg_mvMWFZBo",
  authDomain: "camp-2026-ea14a.firebaseapp.com",
  projectId: "camp-2026-ea14a",
  storageBucket: "camp-2026-ea14a.firebasestorage.app",
  messagingSenderId: "77260355004",
  appId: "1:77260355004:web:1920a543c5021e100e67b9",
  measurementId: "G-DKJZ09LSCY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a a time.
        console.warn("Persistence failed: multiple tabs open");
    } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn("Persistence not supported by browser");
    }
});
