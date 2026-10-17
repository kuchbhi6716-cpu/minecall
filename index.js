
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || true,
  },
  maxHttpBufferSize: 1e6,
});

const PORT = process.env.PORT || 3000;
const distPath = path.join(__dirname, "dist");

app.set("trust proxy", 1);
app.use(express.static(distPath));

// ------------------------------------
// HEALTH CHECK
// ------------------------------------

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "OnlyStream" });
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

function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|password|signature|psid/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }

    return url.origin + url.pathname +
      (url.search ? url.search : "");
  } catch {
    return "[invalid URL]";
  }
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
      "User-Agent": "OnlyStream/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  const contentType =
    response.headers.get("content-type") || "";

  const body = await response.text();

  console.log("[AW Provider] URL:", redactUrl(url));
  console.log("[AW Provider] HTTP status:", response.status);
  console.log("[AW Provider] Content-Type:", contentType);

  if (!response.ok) {
    throw new Error(`Provider returned HTTP ${response.status}`);
  }

  if (!contentType.toLowerCase().includes("json")) {
    throw new Error(
      `Provider returned non-JSON content (HTTP ${response.status}, type: ${contentType || "unknown"})`
    );
  }

  let data;

  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Provider returned invalid JSON");
  }

  if (data && typeof data === "object") {
    const details = data.data ?? data;

    if (details && typeof details === "object") {
      console.log(
        "[AW Provider] Response fields:",
        Object.keys(details)
      );
    }
  }

  return data;
}

// ------------------------------------
// RECORDED VIDEO LIST
// ------------------------------------

async function getVideoList(req) {
  const configuredUrl = process.env.AW_VIDEO_LIST_URL;

  if (!configuredUrl) {
    const error = new Error(
      "Recorded video API is not configured"
    );
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
    const error = new Error(
      "Invalid A.W. Empire video API URL"
    );
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
    value.id ??
    value.videoId ??
    value.video_id ??
    ""
  );

  if (
    id === wantedId &&
    typeof value.detailsUrl === "string"
  ) {
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
      message:
        "Set AW_MODEL_FEED_URL in Render Environment settings.",
    });
  }

  try {
    const url = new URL(feedUrl);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password
    ) {
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
      details: error.message,
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
      details: error.message,
    });
  }
});

// ------------------------------------
// A.W. EMPIRE: RECORDED VIDEO DETAILS API
// ------------------------------------

app.get("/api/aw-video-details", async (req, res) => {
  const videoId = String(req.query.video || "").trim();

  if (!videoId || videoId.length > 200) {
    return res.status(400).json({
      error: "A valid video ID is required",
    });
  }

  try {
    const videoList = await getVideoList(req);
    const video = findVideoById(videoList, videoId);

    if (!video) {
      return res.status(404).json({
        error: "Video not found in the current video list",
      });
    }

    const detailsUrl = parseProviderUrl(
      video.detailsUrl,
      "atwmcd.com"
    );

    const details = await fetchJson(detailsUrl);
    const videoDetails = details?.data ?? details;

    if (
      !videoDetails ||
      typeof videoDetails !== "object" ||
      Array.isArray(videoDetails)
    ) {
      return res.status(502).json({
        error: "Invalid provider details response",
      });
    }

    const detailFields = Object.keys(videoDetails);

    const embedFields = detailFields.filter((key) =>
      /embed|player|script|video.?url|stream/i.test(key)
    );

    console.log("[AW Video Details] Available fields:", detailFields);
    console.log("[AW Video Details] Embed-related fields:", embedFields);

    res.set("Cache-Control", "private, no-store");

    return res.json({
      ...videoDetails,
      _diagnostics: {
        availableFields: detailFields,
        embedRelatedFields: embedFields,
        playerEmbedUrlPresent:
          typeof videoDetails.playerEmbedUrl === "string",
      },
    });
  } catch (error) {
    console.error("A.W. Empire video details error:", error.message);

    return res.status(error.status || 502).json({
      error: "Could not load video details",
      details: error.message,
    });
  }
});

// ------------------------------------
// RANDOM VIDEO CHAT
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
// LIVE COMMENT HELPERS
// ------------------------------------

const liveRoomPrefix = "live:";
const commentRateLimits = new Map();

function normalizeRoomName(value) {
  if (typeof value !== "string") return "";

  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 80);

  return name;
}

function getLiveRoom(model) {
  return liveRoomPrefix + model;
}

function canPostComment(socket) {
  const now = Date.now();
  const previous = commentRateLimits.get(socket.id) || [];

  // Allow at most 5 comments in any rolling 10-second window.
  const recent = previous.filter(
    (timestamp) => now - timestamp < 10000
  );

  if (recent.length >= 5) {
    commentRateLimits.set(socket.id, recent);
    return false;
  }

  recent.push(now);
  commentRateLimits.set(socket.id, recent);

  return true;
}

// ------------------------------------
// SOCKET CONNECTION
// ------------------------------------

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ----------------------------------
  // LIVE COMMENTS: JOIN A MODEL ROOM
  // Client sends the model's username.
  // ----------------------------------

  socket.on("live-join", (rawModel) => {
    const model = normalizeRoomName(rawModel);

    if (!model) {
      socket.emit("live-error", "Invalid stream name.");
      return;
    }

    // Leave the previous stream room when switching models.
    for (const room of socket.rooms) {
      if (room.startsWith(liveRoomPrefix)) {
        socket.leave(room);
      }
    }

    socket.data.liveModel = model;
    socket.join(getLiveRoom(model));

    socket.emit("live-joined", { model });

    console.log(
      "Live comment room joined:",
      socket.id,
      model
    );
  });

  // ----------------------------------
  // LIVE COMMENTS: BROADCAST
  // ----------------------------------

  socket.on("live-comment", (payload) => {
    const model = socket.data.liveModel;

    if (!model || !payload || typeof payload !== "object") {
      return;
    }

    if (!canPostComment(socket)) {
      socket.emit(
        "live-error",
        "Slow down a little before posting another comment."
      );
      return;
    }

    const name =
      typeof payload.name === "string"
        ? payload.name.trim().replace(/\s+/g, " ").slice(0, 24)
        : "";

    const message =
      typeof payload.message === "string"
        ? payload.message.trim().replace(/\s+/g, " ").slice(0, 180)
        : "";

    if (!name || !message) return;

    const comment = {
      id: `${socket.id}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name,
      message,
      createdAt: Date.now(),
    };

    // Broadcast to every viewer in this model's room, including sender.
    io.to(getLiveRoom(model)).emit("live-comment", comment);
  });

  // ----------------------------------
  // RANDOM VIDEO CHAT: MATCHING
  // ----------------------------------

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

    if (!partnerId || typeof isTyping !== "boolean") {
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
      typeof data !== "object" ||
      !["offer", "answer", "candidate"].includes(data.type)
    ) {
      return;
    }

    io.to(partnerId).emit("signal", data);
  });

  // ----------------------------------
  // DISCONNECT
  // ----------------------------------

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    disconnectPartner(socket.id);
    commentRateLimits.delete(socket.id);

    console.log("User disconnected:", socket.id);
  });
});

// ------------------------------------
// REACT CLIENT-SIDE FALLBACK
// Keep AFTER all API routes.
// ------------------------------------

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ------------------------------------
// START SERVER
// ------------------------------------

server.listen(PORT, "0.0.0.0", () => {
  console.log("OnlyStream server running on port", PORT);
});
