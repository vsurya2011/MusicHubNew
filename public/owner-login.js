import { ownerSignIn, ensureGuestAuth, db } from './firebase.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const passwordInput = document.getElementById('passwordInput');
  const ownerNameInput = document.getElementById('ownerName');
  const statusEl = document.getElementById('status');
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room') || localStorage.getItem('roomId') || '';
  loginBtn.addEventListener('click', async () => {
    const password = passwordInput.value.trim();
    if (!password) { statusEl.textContent = 'Please enter owner password'; return; }
    if (!roomId) { statusEl.textContent = 'Create a room first, then use Owner Login'; return; }
    loginBtn.disabled = true; statusEl.textContent = 'Checking…';
    try {
      let user = await ensureGuestAuth();
      user = await ownerSignIn(password);
      const roomRef = ref(db, `rooms/${roomId}`);
      const snap = await get(roomRef);
      if (!snap.exists()) throw new Error('Room not found. Create it from the home page using the owner password first.');
      if (snap.val().ownerUid && snap.val().ownerUid !== user.uid) throw new Error('This room is owned by a different session.');
      if (!snap.val().ownerUid) await update(roomRef, { ownerUid: user.uid });
      localStorage.setItem('username', ownerNameInput.value.trim() || 'Owner');
      localStorage.setItem('roomId', roomId);
      localStorage.setItem('isOwner', 'true');
      location.href = `/room/${roomId}`;
    } catch (e) { statusEl.textContent = e.message || 'Owner login failed'; loginBtn.disabled = false; }
  });
});
