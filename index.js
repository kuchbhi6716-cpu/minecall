
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const distPath = path.join(__dirname, "dist");

// Serve React application
app.use(express.static(distPath));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "OnlyStream" });
});

// ------------------------------------
// CAM4PAYS: ONLINE MODELS
// ------------------------------------
app.get("/api/cam4-models", async (req, res) => {
  try {
    const apiUrl = new URL(
      "https://api.cam4pays.com/api/v1/cams/online.json"
    );

    apiUrl.searchParams.set(
      "aff_id",
      process.env.CAM4_AFF_ID || "66db08bf0f40da23bf28e055"
    );
    apiUrl.searchParams.set("prog", "rs");
    apiUrl.searchParams.set("gender", "female");
    apiUrl.searchParams.set("limit", "50");
    apiUrl.searchParams.set("order_by", "viewers_desc");

    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error("CAM4 API status:", response.status);

      return res.status(502).json({
        error: "CAM4 provider temporarily unavailable"
      });
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("Unexpected CAM4 API response format");

      return res.status(502).json({
        error: "Unexpected CAM4 API response"
      });
    }

    res.set("Cache-Control", "public, max-age=30");
    return res.json(data);
  } catch (error) {
    console.error("CAM4 models error:", error.message);

    return res.status(502).json({
      error: "Could not load CAM4 models"
    });
  }
});

// ------------------------------------
// REACT CLIENT-SIDE FALLBACK
// ------------------------------------
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ------------------------------------
// RANDOM VIDEO CHAT: SOCKET.IO
// ------------------------------------
const waiting = [];
const partners = new Map();

function removeFromQueue(id) {
  let index;

  while ((index = waiting.indexOf(id)) !== -1) {
    waiting.splice(index, 1);
  }
}

function disconnectPartner(id) {
  const partnerId = partners.get(id);
  if (!partnerId) return;

  partners.delete(id);
  partners.delete(partnerId);

  io.to(partnerId).emit("partner-left");
}

function stopSearching(socket) {
  removeFromQueue(socket.id);
  disconnectPartner(socket.id);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-stranger", () => {
    stopSearching(socket);

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

      console.log("Matched:", socket.id, partnerId);
      return;
    }

    waiting.push(socket.id);
    socket.emit("waiting");
    console.log("Waiting in queue:", socket.id);
  });

  socket.on("stop-chat", () => {
    stopSearching(socket);
    console.log("Chat stopped:", socket.id);
  });

  socket.on("typing", (isTyping) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId || typeof isTyping !== "boolean") return;

    io.to(partnerId).emit("typing", isTyping);
  });

  socket.on("chat-message", (message) => {
    const partnerId = partners.get(socket.id);

    if (
      !partnerId ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return;
    }

    io.to(partnerId).emit(
      "chat-message",
      message.trim().slice(0, 1000)
    );
  });

  socket.on("signal", (data) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId || !data || typeof data !== "object") {
      return;
    }

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

// ------------------------------------
// START SERVER
// ------------------------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("OnlyStream server running on port", PORT);
});
