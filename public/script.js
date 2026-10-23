import { auth, db, storage, firestore, ensureGuestAuth, rtdb, files } from './firebase.js';
import { ref, get, set, update, onValue, onDisconnect, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { doc, setDoc, deleteDoc, serverTimestamp as firestoreTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || localStorage.getItem('roomId') || '').toUpperCase();
const username = params.get('name') || localStorage.getItem('username') || 'Guest';
if (!roomCode) location.href = '/';
const $ = id => document.getElementById(id);
$('roomCodeDisplay').textContent = roomCode;
const player = $('player');
let user, isOwner = false, publicControl = false, activeSource = null, isPlayingState = false;
async function refreshOwnerRole(ownerUid) {
  try {
    const current = auth.currentUser;
    if (!current || !ownerUid || current.uid !== ownerUid) { isOwner = false; refreshControlUI(); return; }
    const tokenResult = await current.getIdTokenResult();
    isOwner = tokenResult.claims.owner === true;
  } catch (error) {
    console.warn('Could not verify owner role:', error);
    isOwner = false;
  }
  refreshControlUI();
}
let ytPlayer, ytReady = false, currentYtId = null, currentPlayback = null, lastPlaybackKey = '', currentQueue = null;
let tamilList = [], englishList = [], pendingYT = null, currentUploadPath = null;
let shuffleEnabled = false, repeatEnabled = false, ytQueue = [], ytQueueIndex = -1;
const roomRef = ref(db, `rooms/${roomCode}`);
const playbackRef = ref(db, `rooms/${roomCode}/playback`);
const membersRef = ref(db, `rooms/${roomCode}/members`);
const canControl = () => isOwner || publicControl;
function status(message) { $('statusMsg').textContent = message; }
function refreshControlUI() {
  $('ownerControlBlock').style.display = canControl() ? 'block' : 'none';
  $('ownerOnlyInterface').style.display = isOwner ? 'block' : 'none';
  if (isOwner) $('toggleControlBtn').textContent = publicControl ? '🔒 Restrict Control to Me' : '🔓 Allow Friends to Control';
  status(isOwner ? '✅ Room Owner Control Unlocked' : publicControl ? '🎧 Friends Control Enabled' : '🎧 Listening Mode (Guest)');
  [$('prevBtn'), $('nextBtn'), $('playPauseBtn')].forEach(b => b.classList.toggle('locked', !canControl()));
  $('shuffleBtn').classList.toggle('locked', !canControl()); $('repeatBtn').classList.toggle('locked', !canControl());
  $('progressBar').classList.toggle('disabled', !canControl());
  if (canControl()) loadSongLibrary();
}
function formatTime(s) { s = Number.isFinite(s) && s > 0 ? s : 0; return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function updateProgressUI(current, duration) {
  $('curTime').textContent = formatTime(current); $('durTime').textContent = formatTime(duration);
  $('progressFill').style.width = `${duration > 0 ? Math.min(current / duration * 100, 100) : 0}%`;
}
function setPlayPauseIcon(playing) { $('playIcon').style.display = playing ? 'none' : 'block'; $('pauseIcon').style.display = playing ? 'block' : 'none'; }
function updateModeButtons() {
  $('shuffleBtn').classList.toggle('active-mode', shuffleEnabled);
  $('repeatBtn').classList.toggle('active-mode', repeatEnabled);
  $('shuffleBtn').setAttribute('aria-pressed', String(shuffleEnabled));
  $('repeatBtn').setAttribute('aria-pressed', String(repeatEnabled));
  $('shuffleBtn').title = shuffleEnabled ? 'Shuffle on' : 'Shuffle off';
  $('repeatBtn').title = repeatEnabled ? 'Repeat track on' : 'Repeat track off';
}
function setTrackSubtitle(value) { const el=$('trackSubtitle'); if(el) el.textContent=value || 'Ready to play'; }
function playCurrentYTIndex(index) {
  if (!canControl() || !ytQueue.length) return;
  ytQueueIndex = (index + ytQueue.length) % ytQueue.length;
  const item = ytQueue[ytQueueIndex];
  publishPlayback({type:'yt',videoId:item.videoId,songName:item.title || 'YouTube Video',songArtist:item.channelTitle || 'YouTube',time:0,playing:true});
}
function playNextTrack() {
  if (activeSource === 'yt' && ytQueue.length) {
    if (repeatEnabled && currentYtId) { publishPlayback({...currentPlayback,time:0,playing:true}); return; }
    if (shuffleEnabled && ytQueue.length > 1) {
      let next=ytQueueIndex; while(next===ytQueueIndex) next=Math.floor(Math.random()*ytQueue.length);
      playCurrentYTIndex(next);
    } else if (ytQueueIndex >= 0) playCurrentYTIndex(ytQueueIndex+1);
    return;
  }
  if (currentQueue) {
    if (repeatEnabled) { publishPlayback({...currentPlayback,time:0,playing:true}); return; }
    const next = shuffleEnabled && currentQueue.list.length > 1
      ? Math.floor(Math.random()*currentQueue.list.length)
      : currentQueue.index+1;
    playQueueIndex(currentQueue.list,next);
  }
}
function playPreviousTrack() {
  if (activeSource === 'yt' && ytQueue.length && ytQueueIndex >= 0) {
    if (shuffleEnabled && ytQueue.length > 1) {
      let prev=ytQueueIndex; while(prev===ytQueueIndex) prev=Math.floor(Math.random()*ytQueue.length);
      playCurrentYTIndex(prev);
    } else playCurrentYTIndex(ytQueueIndex-1);
  } else if (currentQueue) {
    const prev = shuffleEnabled && currentQueue.list.length > 1
      ? Math.floor(Math.random()*currentQueue.list.length)
      : currentQueue.index-1;
    playQueueIndex(currentQueue.list,prev);
  }
}
async function publishPlayback(data) {
  if (!canControl()) return;
  const state = { ...data, commandId: Date.now(), updatedAt: Date.now(), updatedBy: user.uid };
  await set(playbackRef, state);
}
async function loadSongs(category, selectId) {
  const select = $(selectId);
  try {
    const response = await fetch(`/api/songs/${category}`); const songs = await response.json();
    select.innerHTML = '';
    if (!response.ok || !Array.isArray(songs) || !songs.length) { select.innerHTML = '<option>No songs found</option>'; return []; }
    songs.forEach(song => { const option = document.createElement('option'); option.value = song.url; option.textContent = song.name; select.appendChild(option); });
    return songs;
  } catch (e) { select.innerHTML = '<option>Failed to load</option>'; console.error(e); return []; }
}
let libraryLoaded = false;
async function loadSongLibrary() { if (libraryLoaded) return; libraryLoaded = true; [tamilList, englishList] = await Promise.all([loadSongs('tamil','tamilSongs'), loadSongs('english','englishSongs')]); }
function locateInLibrary(url) { let i=tamilList.findIndex(s=>s.url===url); if(i>=0)return {list:tamilList,index:i}; i=englishList.findIndex(s=>s.url===url); return i>=0?{list:englishList,index:i}:null; }
function playQueueIndex(list,index) { if (!list?.length) return; const song=list[((index%list.length)+list.length)%list.length]; publishPlayback({type:'audio',song:song.url,songName:song.name,time:0,playing:true,uploadPath:null}); }
function applyYT(data) {
  if (!ytReady || !ytPlayer || !data.videoId) { pendingYT=data; $('trackTitle').textContent='Loading YouTube…'; return; }
  activeSource='yt'; currentYtId=data.videoId; currentQueue=null; $('trackTitle').textContent=data.songName || 'YouTube Video'; setTrackSubtitle(data.songArtist || 'YouTube');
  ytPlayer.loadVideoById({videoId:data.videoId,startSeconds:Number(data.time)||0});
  if (!data.playing) setTimeout(()=>ytPlayer.pauseVideo?.(),500);
  setTimeout(()=>{const title=ytPlayer.getVideoData?.()?.title;if(title)$('trackTitle').textContent=title;},1000);
}
function applyPlayback(data) {
  if (!data || !data.type || data.type==='idle') return;
  const key = data.commandId || `${data.type}|${data.song||data.videoId}|${data.playing}|${data.time}`;
  const sameTrack = currentPlayback && currentPlayback.type===data.type && (data.type==='yt' ? currentPlayback.videoId===data.videoId : currentPlayback.song===data.song);
  const driftTime = Number(data.time)||0;
  if (data.type==='yt') {
    if (!sameTrack || key!==lastPlaybackKey) applyYT(data);
    else if (ytReady && ytPlayer?.getCurrentTime && !canControl() && Math.abs(ytPlayer.getCurrentTime()-driftTime)>3) ytPlayer.seekTo(driftTime,true);
  } else if (data.type==='audio') {
    activeSource='audio'; currentYtId=null; $('trackTitle').textContent=data.songName||'Audio'; setTrackSubtitle(data.uploadPath ? 'Uploaded audio' : 'MusicHub Library');
    if (player.src !== data.song) player.src=data.song;
    if (!sameTrack || key!==lastPlaybackKey) { try { player.currentTime=driftTime; } catch {} }
    else if (!canControl() && Math.abs((player.currentTime || 0) - driftTime) > 3) { try { player.currentTime=driftTime; } catch {} }
    if (data.playing) { player.play().catch(()=>status('Tap play if your browser blocks autoplay')); } else player.pause();
    currentQueue=locateInLibrary(data.song);
  }
  currentPlayback=data; lastPlaybackKey=key; isPlayingState=!!data.playing; setPlayPauseIcon(isPlayingState);
}
function loadYouTubeApi() {
  window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('ytPlayer',{height:'1',width:'1',videoId:'',playerVars:{autoplay:1,controls:0,playsinline:1},events:{onReady:()=>{ytReady=true;if(pendingYT){applyYT(pendingYT);pendingYT=null;}},onStateChange:e=>{if(e.data===YT.PlayerState.ENDED){if(canControl()) playNextTrack(); else {isPlayingState=false;setPlayPauseIcon(false);}}}}});
  };
  const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
}
async function init() {
  user = await ensureGuestAuth();
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) { status('Room does not exist. Ask the owner to create it.'); return; }
  const room = roomSnap.val();
  // Only the server-issued Firebase custom claim grants owner controls.
  publicControl=!!room.publicControl;
  await refreshOwnerRole(room.ownerUid);
  const memberRef=ref(db,`rooms/${roomCode}/members/${user.uid}`);
  await set(memberRef,{name:username,joinedAt:Date.now()});
  onDisconnect(memberRef).remove();
  onValue(ref(db,`rooms/${roomCode}/publicControl`),snap=>{publicControl=!!snap.val();refreshControlUI();});
  onValue(membersRef,snap=>{const select=$('userSelect');select.innerHTML='';Object.values(snap.val()||{}).forEach(m=>{const o=document.createElement('option');o.textContent=m.name||'Guest';select.appendChild(o);});});
  onValue(playbackRef,snap=>applyPlayback(snap.val()));
  onValue(ref(db,`rooms/${roomCode}/ownerUid`),snap=>{ void refreshOwnerRole(snap.val()); });
  loadYouTubeApi();
}
$('toggleControlBtn').addEventListener('click',async()=>{if(!isOwner)return;await update(roomRef,{publicControl:!publicControl});});
$('playTamilBtn').addEventListener('click',()=>{if(!canControl())return;const s=$('tamilSongs');if(s.value)publishPlayback({type:'audio',song:s.value,songName:s.options[s.selectedIndex].text,time:0,playing:true,uploadPath:null});});
$('playEnglishBtn').addEventListener('click',()=>{if(!canControl())return;const s=$('englishSongs');if(s.value)publishPlayback({type:'audio',song:s.value,songName:s.options[s.selectedIndex].text,time:0,playing:true,uploadPath:null});});
$('playLocalBtn').addEventListener('click',async()=>{
  if(!canControl())return; const file=$('fileInput').files[0]; if(!file)return alert('Choose an audio file first!');
  if(!file.type.startsWith('audio/'))return alert('Please choose an audio file.'); if(file.size>24*1024*1024)return alert('Maximum upload size is 24 MB.');
  const path=`temporary-uploads/${roomCode}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;currentUploadPath=path;
  const wrap=$('uploadProgressWrap'),bar=$('uploadProgressBar'),label=$('uploadProgressText');wrap.style.display='block';
  const task=uploadBytesResumable(storageRef(storage,path),file,{contentType:file.type});
  task.on('state_changed',s=>{const pct=Math.round(s.bytesTransferred/s.totalBytes*100);bar.style.width=pct+'%';label.textContent=pct+'%';},e=>{wrap.style.display='none';alert('Upload failed: '+e.message);},async()=>{
    try {const url=await getDownloadURL(task.snapshot.ref);const metadataRef=doc(firestore,'temporaryUploads',`${roomCode}_${Date.now()}`);await setDoc(metadataRef,{roomId:roomCode,ownerUid:user.uid,storagePath:path,fileName:file.name,createdAt:firestoreTimestamp()});await publishPlayback({type:'audio',song:url,songName:file.name,time:0,playing:true,uploadPath:path,uploadDoc:metadataRef.id});$('fileInput').value='';}catch(e){alert('Upload completed but could not start: '+e.message);}finally{wrap.style.display='none';}
  });
});
$('ytSearchBtn').addEventListener('click',performYtSearch);$('ytSearchInput').addEventListener('keydown',e=>{if(e.key==='Enter')performYtSearch();});
async function performYtSearch(){if(!canControl())return;const q=$('ytSearchInput').value.trim(),box=$('ytSearchResults');if(!q)return;box.innerHTML='<div style="padding:8px;color:#ccc">Searching…</div>';try{const r=await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`),data=await r.json();box.innerHTML='';if(!r.ok)throw new Error(data.error||'Search failed');if(!data.length){box.textContent='No results found';return;}ytQueue=data.map(item=>({videoId:item.videoId,title:item.title,channelTitle:item.channelTitle}));ytQueueIndex=-1;data.forEach((item,index)=>{const row=document.createElement('div');row.className='yt-result';const img=document.createElement('img');img.src=item.thumbnail;img.alt='';const info=document.createElement('div'),title=document.createElement('div'),channel=document.createElement('div');title.className='yt-result-title';title.textContent=item.title;channel.className='yt-result-channel';channel.textContent=item.channelTitle;info.append(title,channel);row.append(img,info);row.onclick=()=>{ytQueueIndex=index;publishPlayback({type:'yt',videoId:item.videoId,songName:item.title,songArtist:item.channelTitle,time:0,playing:true});box.innerHTML='';$('ytSearchInput').value='';};box.appendChild(row);});}catch(e){box.innerHTML='';const m=document.createElement('div');m.style.color='#ff6b81';m.textContent=e.message;box.appendChild(m);}}
$('playPauseBtn').addEventListener('click',()=>{if(!canControl()||!currentPlayback)return;publishPlayback({...currentPlayback,playing:!isPlayingState,time:activeSource==='audio'?player.currentTime:ytReady?ytPlayer.getCurrentTime():currentPlayback.time});});
$('prevBtn').addEventListener('click',playPreviousTrack);$('nextBtn').addEventListener('click',playNextTrack);
$('shuffleBtn').addEventListener('click',()=>{if(!canControl())return;shuffleEnabled=!shuffleEnabled;updateModeButtons();});
$('repeatBtn').addEventListener('click',()=>{if(!canControl())return;repeatEnabled=!repeatEnabled;updateModeButtons();});
updateModeButtons();
$('progressBar').addEventListener('click',e=>{if(!canControl()||!currentPlayback)return;const rect=$('progressBar').getBoundingClientRect(),pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));if(activeSource==='audio'&&player.duration)publishPlayback({...currentPlayback,time:pct*player.duration,playing:isPlayingState});else if(activeSource==='yt'&&ytReady&&ytPlayer.getDuration())publishPlayback({...currentPlayback,time:pct*ytPlayer.getDuration(),playing:isPlayingState});});
player.addEventListener('ended',async()=>{if(currentPlayback?.uploadPath){try{await deleteObject(storageRef(storage,currentPlayback.uploadPath));if(currentPlayback.uploadDoc)await deleteDoc(doc(firestore,'temporaryUploads',currentPlayback.uploadDoc));}catch(e){console.warn('Temporary upload cleanup will need manual/automated retry',e.message);}}if(canControl()&&(currentQueue || (activeSource==='yt' && ytQueue.length)))playNextTrack();else{isPlayingState=false;setPlayPauseIcon(false);}});
setInterval(()=>{if(activeSource==='audio'&&!player.paused)updateProgressUI(player.currentTime,player.duration||0);else if(activeSource==='yt'&&ytReady&&ytPlayer?.getCurrentTime)updateProgressUI(ytPlayer.getCurrentTime(),ytPlayer.getDuration());},500);
setInterval(()=>{if(!canControl()||!isPlayingState||!currentPlayback)return;const time=activeSource==='audio'?player.currentTime:activeSource==='yt'&&ytReady?ytPlayer.getCurrentTime():null;if(time!==null&&Number.isFinite(time))update(playbackRef,{time,updatedAt:Date.now(),updatedBy:user.uid}).catch(()=>{});},5000);
init().catch(e=>{console.error(e);status('Firebase connection failed. Check Authentication and Realtime Database rules.');});
