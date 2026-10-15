
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const distPath = path.join(__dirname, "dist");

// ------------------------------------
// SERVE REACT APPLICATION
// ------------------------------------
app.use(express.static(distPath));

// ------------------------------------
// HEALTH CHECK
// ------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "OnlyStream"
  });
});

// ------------------------------------
// A.W. EMPIRE: MODEL FEED API
// ------------------------------------
app.get("/api/aw-models", async (req, res) => {
  const feedUrl = process.env.AW_MODEL_FEED_URL;

  if (!feedUrl) {
    return res.status(503).json({
      error: "A.W. Empire Model Feed is not configured",
      message:
        "Set AW_MODEL_FEED_URL in Render Environment settings."
    });
  }

  try {
    const parsedUrl = new URL(feedUrl);

    if (parsedUrl.protocol !== "https:") {
      return res.status(400).json({
        error: "The Model Feed URL must use HTTPS"
      });
    }

    // Request the official A.W. Empire JSON feed.
    const response = await fetch(parsedUrl, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error(
        "A.W. Empire feed status:",
        response.status
      );

      return res.status(502).json({
        error: "A.W. Empire feed request failed",
        status: response.status
      });
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("json")) {
      return res.status(502).json({
        error: "The configured feed is not JSON",
        message:
          "Select JSON in the A.W. Empire Model Feed generator."
      });
    }

    const data = await response.json();

    // Keep the provider's response intact until
    // its exact data structure is confirmed.
    res.set("Cache-Control", "public, max-age=30");

    return res.json(data);
  } catch (error) {
    console.error(
      "A.W. Empire models error:",
      error.message
    );

    return res.status(502).json({
      error: "Could not load A.W. Empire models"
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

      console.log(
        "Matched:",
        socket.id,
        partnerId
      );

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

    if (
      !partnerId ||
      typeof isTyping !== "boolean"
    ) {
      return;
    }

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

    if (
      !partnerId ||
      !data ||
      typeof data !== "object"
    ) {
      return;
    }

    if (
      !["offer", "answer", "candidate"].includes(
        data.type
      )
    ) {
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
  console.log(
    "OnlyStream server running on port",
    PORT
  );
});
