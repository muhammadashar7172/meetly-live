# Meetly Live (React + Vite + Firebase)

Google-Meet style video meetings. **No backend server to host** — signaling runs on
Firebase Realtime Database, video/audio goes peer-to-peer over WebRTC.

## Features
- Join/create meeting room by code, or one invite link (`?room=CODE`) that opens straight into the meeting
- Full HD 1080p camera (1920x1080@30fps, falls back gracefully) and mic with echo cancellation, noise suppression and auto gain
- WebRTC peer video with tuned bitrates (6 Mbps video / 128 kbps audio) for crisp video and clear voice
- Full HD screen share (1920x1080@30fps, detail content hint) with floating self-view while sharing; system/tab audio forwarded when the browser allows it
- Shared live whiteboard for students: pen colors, thin/thick strokes, eraser, clear board — synced to everyone in the room
- Shared room chat and participant list
- Invite dialog with copy link + WhatsApp/Telegram share buttons
- Responsive dark UI, real browser full screen toggle

## Architecture
| Concern | Technology |
|---|---|
| UI | React 19 + Vite |
| Signaling (presence, WebRTC offer/answer/ICE, chat, whiteboard) | Firebase Realtime Database |
| Video / audio / screen | WebRTC (peer-to-peer) |
| Hosting | Static host (e.g. Vercel) |

`src/signaling.js` writes to these paths:

```
rooms/{code}/peers/{id}       presence  (auto-removed on disconnect)
rooms/{code}/signals/{toId}   WebRTC offer / answer / ICE candidates
rooms/{code}/chat/{id}        chat messages
rooms/{code}/draw/{id}        whiteboard strokes
rooms/{code}/clear/{id}       whiteboard clear
```

The whole `rooms/{code}` node is deleted automatically when the last participant leaves.

## Firebase setup
Config lives in `src/firebase.js`. RTDB security rules (Firebase console → Realtime
Database → Rules) should allow read/write only under `rooms`:

```json
{
  "rules": {
    "rooms": { ".read": true, ".write": true },
    ".read": false,
    ".write": false
  }
}
```

## Run locally
1. `npm install`
2. `npm run dev`
3. Vite opens at `http://localhost:5173` (if not, open it manually).
4. Open two browser tabs and join with the same room code to test.

For camera/mic/screen sharing, use localhost or HTTPS and approve the browser permission prompts.

## Deploy
```
npm run build     # output in dist/
```
Deploy `dist/` to any static host. No server process, environment variables or
database migrations are required.

## Notes / limitations
- WebRTC uses public STUN servers; a TURN server is recommended for reliable
  connections across restrictive networks (Symmetric NAT, strict firewalls).
- The `rooms` rules above are open by design for this demo — anyone with the
  database URL can read/write rooms. Tighten them (e.g. require auth, validate
  paths and payload sizes) before using this for anything sensitive.
- No authentication, moderation, recording or scaling safeguards yet.
