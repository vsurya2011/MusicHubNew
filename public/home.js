import { ensureGuestAuth, ownerSignIn, auth, db, rtdb } from './firebase.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
window.createRoom = function () {
  const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  document.getElementById('room').value = roomId;
  document.getElementById('passArea').style.display = 'block';
  document.getElementById('password').focus();
};
window.joinRoom = async function () {
  const roomId = document.getElementById('room').value.trim().toUpperCase();
  const username = document.getElementById('username').value.trim() || 'Guest';
  const password = document.getElementById('password').value.trim();
  if (!roomId) return alert('Please enter or create a Room Code!');
  try {
    let user = await ensureGuestAuth();
    let isOwner = false;
    if (password) { user = await ownerSignIn(password); isOwner = true; }
    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) {
      if (!isOwner) return alert('Room not found. Ask the room owner to create it first.');
      await set(ref(db, `rooms/${roomId}/ownerUid`), user.uid);
      await set(ref(db, `rooms/${roomId}/publicControl`), false);
      await set(ref(db, `rooms/${roomId}/playback`), { type: 'idle', playing: false, time: 0, updatedAt: Date.now() });
    } else if (isOwner && snap.val().ownerUid && snap.val().ownerUid !== user.uid) {
      return alert('This room belongs to another owner account/session. Create a new room with the owner password.');
    } else if (isOwner && !snap.val().ownerUid) {
      await update(roomRef, { ownerUid: user.uid });
    }
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('username', username);
    localStorage.setItem('isOwner', isOwner ? 'true' : 'false');
    window.location.href = `/room/${roomId}`;
  } catch (error) { console.error(error); alert(error.message || 'Could not join room. Check Firebase setup and rules.'); }
};
