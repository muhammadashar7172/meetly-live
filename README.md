# Meetly Live (React + Vite + Socket.IO)

## Features
- Join/create meeting room by code, or one invite link (`?room=CODE`) that opens straight into the meeting
- Full HD 1080p camera (1920x1080@30fps, falls back gracefully) and mic with echo cancellation, noise suppression and auto gain
- WebRTC peer video with tuned bitrates (6 Mbps video / 128 kbps audio) for crisp video and clear voice
- Full HD screen share (1920x1080@30fps, detail content hint) with floating self-view while sharing; system/tab audio forwarded when the browser allows it
- Shared live whiteboard for students: pen colors, thin/thick strokes, eraser, clear board — synced to everyone in the room
- Shared room chat and participant list
- Invite dialog with copy link + WhatsApp/Telegram share buttons
- Responsive dark UI, real browser full screen toggle

## Requirements
Node.js 18+ recommended.

## Run locally
1. Extract the zip and open its folder in a terminal.
2. Install packages: `npm install`
3. Start both frontend and signaling server: `npm start`
4. Vite opens at `http://localhost:5173` (if it doesn't, visit it manually).
5. Open the app in two browser tabs/devices and use the same room code to test joining.

For camera/mic/screen sharing, use localhost or HTTPS and approve the browser permission prompts.

## Deployment note
The signaling server in `server.js` must be hosted and reachable by clients; set the Socket.IO URL with a `VITE_SOCKET_URL` env var in a `.env` file (defaults to `http://localhost:3001` on localhost, same-origin elsewhere). WebRTC uses a public STUN server; a TURN server is recommended for reliable connections across restrictive networks. This is an early starter/prototype and is not hardened for production security, moderation, authentication, recording, or scaling.
