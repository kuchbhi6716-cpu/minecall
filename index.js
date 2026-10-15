const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const distPath = path.join(__dirname, "dist");
app.set("trust proxy", 1);
app.use(express.static(distPath));
// ------------------------------------
// HEALTH CHECK
// ------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "OnlyStream",
  });
});
// ------------------------------------
// HELPERS
// ------------------------------------
function getClientIp(req) {
  return (
    req.ip ||
    req.socket.remoteAddress ||
    ""
  ).replace(/^::ffff:/, "");
}
function parseProviderUrl(rawUrl, allowedHost) {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== allowedHost ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid provider URL");
  }
  return url;
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Provider returned status ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("Provider did not return JSON");
  }
  return response.json();
}
async function getVideoList(req) {
  const configuredUrl = process.env.AW_VIDEO_LIST_URL;
  if (!configuredUrl) {
    const error = new Error("Recorded video API is not configured");
    error.status = 503;
    throw error;
  }
  const clientIp = getClientIp(req);
  const replacedUrl = configuredUrl.replace(
    /CLIENT_IP/g,
    encodeURIComponent(clientIp)
  );
  const url = new URL(replacedUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "atwmcd.com" ||
    url.username ||
    url.password
  ) {
    const error = new Error("Invalid A.W. Empire video API URL");
    error.status = 400;
    throw error;
  }
  if (url.searchParams.has("clientIp")) {
    url.searchParams.set("clientIp", clientIp);
  }
  return fetchJson(url);
}
// ------------------------------------
// FIND VIDEO BY ID
// ------------------------------------
function findVideoById(value, wantedId) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoById(item, wantedId);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = String(
    value.id ?? value.videoId ?? value.video_id ?? ""
  );
  if (id === wantedId && typeof value.detailsUrl === "string") {
    return value;
  }
  for (const child of Object.values(value)) {
    const found = findVideoById(child, wantedId);
    if (found) return found;
  }
  return null;
}
// ------------------------------------
// A.W. EMPIRE: MODEL FEED API
// ------------------------------------
app.get("/api/aw-models", async (req, res) => {
  const feedUrl = process.env.AW_MODEL_FEED_URL;
  if (!feedUrl) {
    return res.status(503).json({
      error: "A.W. Empire Model Feed is not configured",
      message: "Set AW_MODEL_FEED_URL in Render Environment settings.",
    });
  }
  try {
    const url = new URL(feedUrl);
    if (url.protocol !== "https:") {
      return res.status(400).json({
        error: "The Model Feed URL must use HTTPS",
      });
    }
    const data = await fetchJson(url);
    res.set("Cache-Control", "public, max-age=30");
    return res.json(data);
  } catch (error) {
    console.error("A.W. Empire models error:", error.message);
    return res.status(error.status || 502).json({
      error: "Could not load A.W. Empire models",
    });
  }
});
// ------------------------------------
// A.W. EMPIRE: RECORDED VIDEO LIST API
// ------------------------------------
app.get("/api/aw-videos", async (req, res) => {
  try {
    const data = await getVideoList(req);
    res.set("Cache-Control", "private, no-store");
    return res.json(data);
  } catch (error) {
    console.error("A.W. Empire videos error:", error.message);
    return res.status(error.status || 502).json({
      error:
        error.message === "Recorded video API is not configured"
          ? error.message
          : "Could not load recorded videos",
    });
  }
});
// ------------------------------------
// A.W. EMPIRE: RECORDED VIDEO DETAILS API
// GET /api/aw-video-details?video=VIDEO_ID
// ------------------------------------
app.get("/api/aw-video-details", async (req, res) => {
  const videoId = String(req.query.video || "").trim();
  if (!videoId || videoId.length > 200) {
    return res.status(400).json({
      error: "A valid video ID is required",
    });
  }
  try {
    // Fetch the visitor-specific video list.
    const videoList = await getVideoList(req);
    const video = findVideoById(videoList, videoId);
    if (!video) {
      return res.status(404).json({
        error: "Video not found in the current video list",
      });
    }
    // Validate the provider's details URL.
    const detailsUrl = parseProviderUrl(
      video.detailsUrl,
      "atwmcd.com"
    );
    const details = await fetchJson(detailsUrl);
    // IMPORTANT:
    // The provider returns playerEmbedUrl inside "data".
    // Example: { success: true, status: "OK", data: { playerEmbedUrl: "..." } }
    // Normalize the response so the frontend receives playerEmbedUrl
    // at the top level.
    const videoDetails = details?.data ?? details;
    if (
      !videoDetails ||
      typeof videoDetails.playerEmbedUrl !== "string" ||
      !videoDetails.playerEmbedUrl.startsWith("https://atwmcd.com/")
    ) {
      console.error(
        "A.W. Empire details response missing a valid playerEmbedUrl"
      );
      return res.status(502).json({
        error: "Provider response did not include a valid playerEmbedUrl",
      });
    }
    // Return normalized details to the frontend.
    res.set("Cache-Control", "private, no-store");
    return res.json({
      ...videoDetails,
      playerEmbedUrl: videoDetails.playerEmbedUrl,
    });
  } catch (error) {
    console.error("A.W. Empire video details error:", error.message);
    return res.status(error.status || 502).json({
      error: "Could not load video details",
    });
  }
});
// ------------------------------------
// REACT CLIENT-SIDE FALLBACK
// Keep AFTER all API routes.
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
// ------------------------------------
// SOCKET CONNECTION
// ------------------------------------
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
        initiator: socket.id < partnerId,
      });
      io.to(partnerId).emit("matched", {
        initiator: partnerId < socket.id,
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
    if (
      !partnerId ||
      !data ||
      typeof data !== "object" ||
      !["offer", "answer", "candidate"].includes(data.type)
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
server.listen(PORT, "0.0.0.0", () => {
  console.log("OnlyStream server running on port", PORT);
});
