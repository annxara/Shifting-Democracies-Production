# sketch-relay — Socket.io Implementation Guide

## Overview

This project is a **real-time parameter relay** built with Express and Socket.io. It connects two browser clients — a **controller** (`gui.html`) and a **sketch** (`index.html`) — through a central Node.js server. Any slider moved in the controller is instantly broadcast to the sketch (and vice versa), without the server storing any state.

---

## Architecture

```
[ gui.html ]  ──emit "params"──▶  [ server.js ]  ──broadcast──▶  [ index.html / sketch.js ]
  Controller                        Relay Server                      p5.js Sketch
```

- The server acts as a **dumb relay** — it never reads or stores parameter values.
- All clients share the same Socket.io namespace (default `/`).
- Any event emitted by one client is forwarded to **all other connected clients**.

---

## How Socket.io is Implemented

### Server (`server.js`)

```js
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.onAny((event, value) => {
    socket.broadcast.emit(event, value); // relay to everyone else
  });
});
```

Key points:

- `socket.onAny()` catches **every event name** — so the relay works for any future events without code changes.
- `socket.broadcast.emit()` sends the event to **all clients except the sender**.
- CORS is open (`origin: "*"`), which is fine for local/creative use but should be restricted in production.
- The server serves static files from `__dirname`, so all HTML, JS, and CSS files in the same folder are accessible directly.

---

### Controller (`gui.html`)

```js
const socket = io(SERVER_URL);

["stfeco", "stflife", "stfgov"].forEach((key) => {
  document.getElementById(key).addEventListener("input", function () {
    params[key] = Number(this.value);
    socket.emit("params", params); // send the full params object
  });
});

socket.on("params", (incoming) => {
  // receive updates from others
  Object.assign(params, incoming);
  // update sliders and display values
});
```

The controller both **emits** and **listens** for `"params"` events, so multiple controller windows stay in sync with each other automatically.

The `SERVER_URL` is chosen dynamically:

```js
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = isLocal ? "http://localhost:8080" : window.location.origin;
```

This means the same file works both locally and when deployed.

---

### Sketch (`index.html` + `sketch.js`)

The sketch page loads Socket.io from the CDN and is expected to connect to the same server in `sketch.js`. It receives `"params"` events and uses the values to drive the p5.js visuals in real time. The three parameters relayed are:

| Parameter | Range | Meaning            |
| --------- | ----- | ------------------ |
| `stfeco`  | 0–10  | Economy setting    |
| `stflife` | 0–10  | Life setting       |
| `stfgov`  | 0–10  | Governance setting |

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

The server will print:

```
✅ Running on port 8080
```

### Opening the Clients

Open **two separate browser tabs** (or windows):

| Tab        | URL                            | Role                                     |
| ---------- | ------------------------------ | ---------------------------------------- |
| Sketch     | http://localhost:8080          | Displays the p5.js visual (`index.html`) |
| Controller | http://localhost:8080/gui.html | Sliders to control the sketch            |

Move a slider in the controller tab — the `"params"` event is emitted, relayed by the server, and received by the sketch tab instantly.

---

## File Structure

```
.
├── server.js       # Express + Socket.io relay server
├── package.json    # Dependencies (express, socket.io)
├── index.html      # Sketch viewer (p5.js entry point)
├── gui.html        # Slider controller UI
├── sketch.js       # p5.js sketch (reads socket params)
├── style.css       # Sketch styles
└── gui.css         # Controller styles
```

---

## Tips & Notes

- **Multiple controllers** can be open simultaneously — they all stay in sync because every client both emits and receives `"params"`.
- **No persistence** — if all clients disconnect, parameter values reset to defaults on next load.
- To change the port, set the `PORT` environment variable: `PORT=3000 npm start`.
- For deployment (e.g. Railway, Render), no code changes are needed — `SERVER_URL` auto-detects the origin.
