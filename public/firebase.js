import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, onDisconnect, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp as firestoreTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const firestore = getFirestore(app);
export const rtdb = { ref, get, set, update, onValue, onDisconnect, remove, serverTimestamp };
export const files = { storageRef, uploadBytesResumable, getDownloadURL, deleteObject, doc, setDoc, deleteDoc, firestoreTimestamp };

// Wait until Firebase restores the persisted session before deciding to create a guest.
// Without this, a page refresh/navigation can race auth restoration and replace the owner
// session with a new anonymous session, making the room display "Listening Mode (Guest)".
export async function ensureGuestAuth() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  if (!auth.currentUser) {
    throw new Error('Firebase sign-in did not complete. Please refresh and try again.');
  }
  return auth.currentUser;
}

export async function ownerSignIn(password) {
  const user = await ensureGuestAuth();
  const response = await fetch('/api/owner-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, uid: user.uid })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.customToken) {
    throw new Error(data.error || 'Owner login failed');
  }
  // signInWithCustomToken returns a UserCredential; token methods belong to its .user.
  const userCredential = await signInWithCustomToken(auth, data.customToken);
  const signedInUser = userCredential.user;
  if (!signedInUser) {
    throw new Error('Firebase did not return a signed-in user. Please try again.');
  }
  // Force-refresh the ID token so the owner custom claim is available before navigation.
  await signedInUser.getIdToken(true);
  const tokenResult = await signedInUser.getIdTokenResult();
  if (tokenResult.claims.owner !== true) {
    throw new Error('Owner access was not included in the Firebase token. Check /api/owner-auth and redeploy.');
  }
  return signedInUser;
}
