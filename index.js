const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const distPath = path.join(__dirname, "dist");

// Serve the compiled React application.
app.use(express.static(distPath));

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "RandomCall" });
});


app.get("/api/models-online", async (req, res) => {
  try {
    const campaignId = process.env.BONGACAMS_CAMPAIGN_ID;

    if (!campaignId) {
      return res.status(500).json({
        error: "BongaCams campaign ID is not configured"
      });
    }

    // The API requires the visitor's IPv4 address.
    const forwardedFor = req.headers["x-forwarded-for"];
    const visitorIp = (
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0].trim()
        : req.socket.remoteAddress || ""
    ).replace(/^::ffff:/, "");

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(visitorIp)) {
      return res.status(400).json({
        error: "A valid visitor IPv4 address is required"
      });
    }

    const apiUrl = new URL(
      "https://bngprm.com/api/v2/models-online"
    );

    apiUrl.searchParams.set("c", campaignId);
    apiUrl.searchParams.set("client_ip", visitorIp);
    apiUrl.searchParams.set("limit", "30");
    apiUrl.searchParams.set("offset", "0");

    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error("BongaCams API status:", response.status);
      return res.status(502).json({
        error: "Model provider temporarily unavailable"
      });
    }

    const data = await response.json();
    const models = Array.isArray(data.models)
      ? data.models
      : Array.isArray(data.online_models)
        ? data.online_models
        : [];

    const result = models.map((model) => ({
      username: model.username || "",
      name: model.display_name || model.username || "Live model",
      age: model.display_age ?? null,
      profileUrl: model.profile_page_url || "",
      thumbnail:
        model.live_images?.thumbnail_image_medium ||
        model.profile_images?.thumbnail_image_medium ||
        model.live_images?.thumbnail_image_big ||
        "",
      online: true
    }));

    res.set("Cache-Control", "public, max-age=15");
    return res.json({ models: result });
  } catch (error) {
    console.error("BongaCams models error:", error.message);
    return res.status(502).json({
      error: "Could not load models right now"
    });
  }
});


// React client-side fallback. Keep API and Socket.IO paths untouched.
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

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
    // Remove this user from any previous queue or match first.
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

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("RandomCall server running on port", PORT);
});
