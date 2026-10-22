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
export async function ensureGuestAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
export async function ownerSignIn(password) {
  const user = await ensureGuestAuth();
  const response = await fetch('/api/owner-auth', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password, uid: user.uid }) });
  const data = await response.json();
  if (!response.ok || !data.customToken) throw new Error(data.error || 'Owner login failed');
  await signInWithCustomToken(auth, data.customToken);
  return auth.currentUser;
}
