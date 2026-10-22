# Quick setup (Vercel + Firebase only)

1. In Firebase project `musichub-9773e`, enable Authentication → Anonymous, Realtime Database, Firestore, and Storage.
2. Publish `database.rules.json`, `firestore.rules`, and `storage.rules` in the corresponding Firebase consoles (or deploy using Firebase CLI after installing it).
3. Create a Firebase service account key. Keep the JSON private.
4. In Vercel, add environment variables:
   - `OWNER_PASSWORD` = your strong private owner password
   - `YOUTUBE_API_KEY` = your YouTube Data API v3 key
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = the complete service account JSON on one line
5. Import this folder into Vercel. Set the project root to this folder; install command `npm install`; no build command is required.
6. Deploy, then create a room using the owner password. Guests join using the room code without the owner password.

Firestore stores upload metadata only. Audio bytes go to Firebase Storage because Firestore documents are limited to 1 MiB. Uploaded audio is intended to be temporary and the client attempts to delete it when playback ends. Client-side cleanup is best-effort if a browser closes unexpectedly.
