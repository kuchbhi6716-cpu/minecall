
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const waiting = [];
const partners = new Map();

function removeFromQueue(id) {
  const index = waiting.indexOf(id);
  if (index !== -1) waiting.splice(index, 1);
}

function disconnectPartner(id) {
  const partnerId = partners.get(id);
  if (!partnerId) return;

  partners.delete(id);
  partners.delete(partnerId);

  io.to(partnerId).emit("partner-left");
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-stranger", () => {
    removeFromQueue(socket.id);
    disconnectPartner(socket.id);

    while (waiting.length > 0) {
      const partnerId = waiting.shift();

      if (
        partnerId === socket.id ||
        !io.sockets.sockets.has(partnerId) ||
        partners.has(partnerId)
      ) {
        continue;
      }

      partners.set(socket.id, partnerId);
      partners.set(partnerId, socket.id);

      socket.emit("matched", {
        initiator: socket.id < partnerId
      });

      io.to(partnerId).emit("matched", {
        initiator: partnerId < socket.id
      });

      return;
    }

    waiting.push(socket.id);
    socket.emit("waiting");
  });

  socket.on("chat-message", (message) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId || typeof message !== "string") return;

    io.to(partnerId).emit(
      "chat-message",
      message.trim().slice(0, 1000)
    );
  });

  socket.on("signal", (data) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId || !data || typeof data !== "object") return;

    if (!["offer", "answer", "candidate"].includes(data.type)) {
      return;
    }

    io.to(partnerId).emit("signal", data);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    disconnectPartner(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("RandomCall server running on port", PORT);
});

