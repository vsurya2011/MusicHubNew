# Music Room — Vercel + Firebase (no Render)

This version removes Express/Socket.IO and uses Firebase Realtime Database for synchronized room playback and presence. Vercel serves the static app and three serverless API endpoints. Firebase Storage holds temporary uploaded audio bytes; Firestore stores only temporary upload metadata. **Firestore is not suitable for audio bytes**: Firestore documents are limited to 1 MiB, so uploaded audio belongs in Firebase Storage.

## Features kept
- Tamil and English song lists loaded from `vsurya2011/Music-Room` on GitHub
- YouTube search via a server-side Vercel function
- Room codes, room member list, owner controls and public-control toggle
- Shared playback state for audio and YouTube
- Temporary audio uploads (max 24 MB); uploaded objects are deleted by the room client when playback ends
- No Render or Socket.IO dependency

## 1. Firebase Console
Project config is already integrated in `public/firebase-config.js` for project `musichub-9773e`.

Enable:
1. **Authentication → Sign-in method → Anonymous**
2. **Realtime Database** in region `asia-southeast1`
3. **Cloud Firestore** (default database)
4. **Storage**

In Realtime Database → Rules, publish `database.rules.json` (or deploy with Firebase CLI). In Firestore → Rules, publish `firestore.rules`. In Storage → Rules, publish `storage.rules`.

## 2. Vercel environment variables
Import this folder as a project in Vercel. Set these variables in Project Settings → Environment Variables for Production and Preview:

- `OWNER_PASSWORD`: choose a strong owner password (do not use a public/default password)
- `YOUTUBE_API_KEY`: a YouTube Data API v3 key with the YouTube Data API enabled
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the full JSON contents of a Firebase service-account key for this project. Create it in Firebase Console → Project settings → Service accounts. Keep this value only in Vercel environment variables; never commit it.

The service account is needed only by `/api/owner-auth` to issue Firebase custom tokens carrying the `owner` claim. If missing, owner login returns a setup error.

## 3. Deploy to Vercel
- Push the project to a Git repository and import it into Vercel, or use the Vercel CLI.
- Framework preset: Other; root directory is the folder containing `vercel.json` and `package.json`.
- Build command: leave blank; output directory: `public` is not needed because `vercel.json` serves the `public` folder.
- Install command: `npm install`.
- Deploy. No Render service is used.

## 4. Test
1. Open the Vercel URL.
2. Enter a username and create a room; enter the owner password you configured in Vercel.
3. Open the room URL in another browser/device and join with the room code without the owner password.
4. Test playback, YouTube search, public control and temporary upload.

## Important limitations / security notes
- Firebase web config's `apiKey` is a public client identifier, not a server secret. Database, Firestore and Storage rules are what protect data.
- The app uses Firebase custom claims for owner authorization. Keep `FIREBASE_SERVICE_ACCOUNT_JSON` and `OWNER_PASSWORD` private.
- Temporary uploads are deleted when the active audio ends and the client is online. For guaranteed cleanup after abandoned rooms, add a scheduled Firebase/Google Cloud cleanup job; the current client-side cleanup is best-effort.
- Browser autoplay rules may require each guest to tap the page/play control once before audio can start automatically.
- YouTube search requires `YOUTUBE_API_KEY` in Vercel. The key is not exposed to the browser.
- Firestore stores upload metadata only. Firebase Storage stores the actual audio file, because Firestore's 1 MiB document limit is too small for normal music uploads.
- Configure Firebase billing/quotas as needed for your chosen services. Vercel and Firebase free-tier quotas may apply.
