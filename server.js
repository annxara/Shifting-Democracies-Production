const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const PORT = process.env.PORT || 8080;
const app = express();
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/detail", (req, res) => res.sendFile(path.join(__dirname, "detail.html")));

const httpServer = createServer(app);

const ALLOWED_ORIGIN = process.env.RENDER_EXTERNAL_URL || "http://localhost:8080";
// const io = new Server(httpServer, {
//   cors: {
//     origin: ALLOWED_ORIGIN,
//     methods: ["GET", "POST"],
//   },
// });

const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log(`[+] connected (total: ${io.engine.clientsCount})`);

  // Relay every event to all other clients
  socket.onAny((event, value) => {
    socket.broadcast.emit(event, value);
  });

  socket.on("disconnect", () => {
    console.log(`[-] disconnected (total: ${io.engine.clientsCount})`);
  });
});

httpServer.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
