// ============================================================================
// SOCKET.IO RELAY SERVER - Express + real-time communication
// ============================================================================
// This server acts as a "dumb relay" between connected clients.
// It doesn't store any data - it just broadcasts events to all other clients.
// Allows gui.html and sketch.js to communicate in real-time.
// ============================================================================

// Dependencies
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

// ==== SERVER CONFIGURATION ====
const PORT = process.env.PORT || 8080; // Port: 8080 locally, or Render env variable
const app = express();

// Serve static files (HTML, CSS, JS) from current directory
app.use(express.static(__dirname));

// Route: root path serves index.html
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const httpServer = createServer(app);

const ALLOWED_ORIGIN =
  process.env.RENDER_EXTERNAL_URL || "http://localhost:8080";
// const io = new Server(httpServer, {
//   cors: {
//     origin: ALLOWED_ORIGIN,
//     methods: ["GET", "POST"],
//   },
// });

const io = new Server(httpServer, { cors: { origin: "*" } });

// ==== CONNECTION HANDLER ====
io.on("connection", (socket) => {
  // Log when client connects
  console.log(`[+] connected (total: ${io.engine.clientsCount})`);

  // ==== EVENT RELAY ====
  // Listen for ANY event from this client
  socket.onAny((event, value) => {
    // Broadcast it to all OTHER clients (not back to sender)
    socket.broadcast.emit(event, value);
  });

  // Log when client disconnects
  socket.on("disconnect", () => {
    console.log(`[-] disconnected (total: ${io.engine.clientsCount})`);
  });
});

// ==== START SERVER ====
httpServer.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
