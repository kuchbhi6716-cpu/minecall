
import React, { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Eye,
  Send,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";
const COMMENT_DURATION = 6000;
const MAX_VISIBLE_COMMENTS = 12;

// ------------------------------------
// CONNECTION WARM-UP
// ------------------------------------

function warmUpProvider() {
  ["https://atwmcd.com", "https://edwmcr.com"].forEach((url) => {
    if (
      document.querySelector(
        `link[rel="preconnect"][href="${url}"]`
      )
    ) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = url;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  });
}

// ------------------------------------
// MODEL HELPERS
// ------------------------------------

function getUsername(item) {
  return String(
    item?.username ||
      item?.nickname ||
      item?.performerId ||
      item?.performer_id ||
      item?.id ||
      item?.name ||
      ""
  ).trim();
}

function getThumbnail(item) {
  const images = [
    item?.profilePictureUrl?.size800x600,
    item?.profilePictureUrl?.size320x180,
    item?.thumbnail,
    item?.thumb,
    item?.thumb_big,
    item?.profile_thumb_sfw,
    item?.profile_thumb,
    item?.image,
    item?.imageUrl,
    item?.image_url,
  ];

  return (
    images.find(
      (image) => typeof image === "string" && image.trim()
    ) || ""
  );
}

function extractModels(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];

  const candidates = [
    response.data?.models,
    response.models,
    response.data?.performers,
    response.performers,
    response.data?.results,
    response.results,
    response.data?.items,
    response.items,
    response.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;

    if (candidate && typeof candidate === "object") {
      for (const key of ["models", "performers", "results", "items"]) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }

  return [];
}

function normalizeModel(item) {
  const age = Number(item?.persons?.[0]?.age ?? item?.age ?? 0);

  return {
    username: getUsername(item),
    name:
      item?.displayName ||
      item?.nickname ||
      item?.username ||
      item?.performerId ||
      item?.name ||
      "Live Model",
    age: Number.isFinite(age) ? age : 0,
    thumbnail: getThumbnail(item),
    viewers:
      Number(
        item?.viewers ??
          item?.viewerCount ??
          item?.viewer_count ??
          item?.numViewers ??
          0
      ) || 0,
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
  };
}

// ------------------------------------
// LIVE MODEL PLAYER
// ------------------------------------

function AWLivePlayer({ username }) {
  const [retry, setRetry] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    warmUpProvider();

    const container = document.getElementById("object_container");

    if (!container || !username) {
      setPlayerError("No model selected.");
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    let observer;

    container.replaceChildren();
    setPlayerError("");
    setPlayerReady(false);

    const params = new URLSearchParams();

    params.set("c", "object_container");
    params.set("site", "jasmin");
    params.set("cobrandId", "");
    params.set("psid", "kuchbhi6677");
    params.set("pstool", "202_1");
    params.set("psprogram", "revs");
    params.set("campaign_id", "");
    params.set("category", "girl");

    params.set("vp[showChat]", "");
    params.set("vp[chatAutoHide]", "");
    params.set("vp[showCallToAction]", "");
    params.set("vp[showPerformerName]", "true");
    params.set("vp[showPerformerStatus]", "true");

    params.set("ms_notrack", "1");
    params.set("subAffId", "");
    params.set("forcedPerformers[]", username);

    const script = document.createElement("script");
    script.async = true;
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;

    function cleanup() {
      window.clearTimeout(timeoutId);

      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function checkPlayer() {
      if (cancelled) return false;

      const player = container.querySelector(
        "iframe, video, object, embed"
      );

      if (!player) return false;

      setPlayerReady(true);
      setPlayerError("");
      cleanup();
      return true;
    }

    script.onload = () => {
      if (cancelled) return;

      observer = new MutationObserver(checkPlayer);

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      if (checkPlayer()) return;

      timeoutId = window.setTimeout(() => {
        if (!cancelled && !checkPlayer()) {
          setPlayerError(
            "Player load nahi hua. Provider embed settings check karo."
          );
        }
      }, 20000);
    };

    script.onerror = () => {
      if (!cancelled) {
        setPlayerError(
          "Player script load nahi hua. Retry karke dekho."
        );
      }
    };

    container.appendChild(script);

    return () => {
      cancelled = true;
      cleanup();
      container.replaceChildren();
    };
  }, [username, retry]);

  return (
    <div className="onlystream-embed-wrap">
      <div
        id="object_container"
        className="onlystream-embed"
        style={{
          width: "350px",
          height: "210px",
          maxWidth: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      />

      {!playerReady && !playerError && (
        <div className="video-skeleton" aria-live="polite">
          <div className="skeleton-glow" />

          <div className="skeleton-content">
            <div className="skeleton-orb">▶</div>
            <div className="skeleton-line" />
            <div className="skeleton-caption">
              Connecting to live stream...
            </div>
          </div>

          <div className="skeleton-progress">
            <div />
          </div>
        </div>
      )}

      {playerError && (
        <div className="player-error">
          <p>{playerError}</p>

          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry player
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------
// REAL-TIME VIEWER COMMENTS
// Comments and composer live inside the details card.
// ------------------------------------

function LiveComments({ username }) {
  const [guestName, setGuestName] = useState(() => {
    try {
      return localStorage.getItem("onlystream-guest-name") || "";
    } catch {
      return "";
    }
  });

  const [message, setMessage] = useState("");
  const [comments, setComments] = useState([]);
  const [chatStatus, setChatStatus] = useState("Connecting...");
  const [notice, setNotice] = useState("");

  const socketRef = useRef(null);
  const timersRef = useRef(new Map());
  const commentsRef = useRef([]);
  const noticeTimerRef = useRef(null);

  const showNotice = useCallback((text) => {
    setNotice(text);
    window.clearTimeout(noticeTimerRef.current);

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
    }, 3000);
  }, []);

  const removeComment = useCallback((id) => {
    window.clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);

    const next = commentsRef.current.filter(
      (comment) => comment.id !== id
    );

    commentsRef.current = next;
    setComments(next);
  }, []);

  useEffect(() => {
    if (!username) return undefined;

    const socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketRef.current = socket;

    function joinLiveRoom() {
      setChatStatus("Joining chat...");
      socket.emit("live-join", username);
    }

    socket.on("connect", joinLiveRoom);

    socket.on("disconnect", () => {
      setChatStatus("Reconnecting...");
    });

    socket.on("connect_error", () => {
      setChatStatus("Chat unavailable");
    });

    socket.on("live-joined", () => {
      setChatStatus("Live chat connected");
    });

    socket.on("live-error", (payload) => {
      showNotice(
        typeof payload === "string"
          ? payload
          : payload?.message || "Unable to send comment."
      );
    });

    socket.on("live-comment", (comment) => {
      if (
        !comment ||
        typeof comment.id !== "string" ||
        typeof comment.message !== "string"
      ) {
        return;
      }

      if (
        commentsRef.current.some(
          (existing) => existing.id === comment.id
        )
      ) {
        return;
      }

      const next = [
        ...commentsRef.current,
        {
          id: comment.id,
          name: String(comment.name || "Guest").slice(0, 24),
          message: comment.message.slice(0, 180),
        },
      ].slice(-MAX_VISIBLE_COMMENTS);

      const visibleIds = new Set(next.map((item) => item.id));

      for (const [id, timer] of timersRef.current.entries()) {
        if (!visibleIds.has(id)) {
          window.clearTimeout(timer);
          timersRef.current.delete(id);
        }
      }

      commentsRef.current = next;
      setComments(next);

      window.clearTimeout(timersRef.current.get(comment.id));

      const timer = window.setTimeout(() => {
        removeComment(comment.id);
      }, COMMENT_DURATION);

      timersRef.current.set(comment.id, timer);
    });

    if (socket.connected) joinLiveRoom();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();

      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }

      timersRef.current.clear();
      commentsRef.current = [];
      socketRef.current = null;

      window.clearTimeout(noticeTimerRef.current);
    };
  }, [username, removeComment, showNotice]);

  function sendComment(event) {
    event.preventDefault();

    const name = guestName.trim().replace(/\s+/g, " ");
    const text = message.trim().replace(/\s+/g, " ");

    if (!name) {
      showNotice("Pehle guest name enter karo.");
      return;
    }

    if (!text) return;

    if (name.length > 24 || text.length > 180) {
      showNotice("Name ya comment bahut lamba hai.");
      return;
    }

    if (!socketRef.current?.connected) {
      showNotice("Chat reconnect ho raha hai. Dobara try karo.");
      return;
    }

    try {
      localStorage.setItem("onlystream-guest-name", name);
    } catch {
      // Continue if local storage is unavailable.
    }

    socketRef.current.emit("live-comment", {
      name,
      message: text,
    });

    setMessage("");
    setNotice("");
  }

  return (
    <div className="live-comments-card">
      <div className="live-comment-composer">
        <form className="live-comment-form" onSubmit={sendComment}>
          <input
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="Your guest name"
            aria-label="Guest name"
            maxLength={24}
          />

          <div className="live-comment-input-row">
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write a comment..."
              aria-label="Write a live comment"
              maxLength={180}
            />

            <button
              type="submit"
              aria-label="Send comment"
              disabled={!message.trim()}
            >
              <Send size={16} />
            </button>
          </div>
        </form>

        <div className="live-comment-status">
          <span
            className={`live-status-dot ${
              chatStatus === "Live chat connected" ? "is-online" : ""
            }`}
          />
          <span>{chatStatus}</span>
          {notice && (
            <span className="live-comment-notice">{notice}</span>
          )}
        </div>
      </div>

      {comments.length > 0 && (
        <div className="live-card-comments" aria-live="polite">
          {comments.map((comment) => (
            <div className="live-card-comment" key={comment.id}>
              <span className="live-comment-name">
                {comment.name}
              </span>
              <span className="live-comment-message">
                {comment.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------
// PAGE — ORIGINAL MODEL LOADING
// ------------------------------------

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const requestedModel = (params.get("model") || "").trim();

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadModel() {
      setLoading(true);
      setError("");
      setModel(null);

      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Model feed error (${response.status}).`);
        }

        const data = await response.json();

        const models = extractModels(data)
          .filter((item) => item && typeof item === "object")
          .map(normalizeModel)
          .filter((item) => item.username);

        const target = requestedModel.toLowerCase();

        const selected = models.find(
          (item) =>
            item.username.toLowerCase() === target ||
            item.name.toLowerCase() === target
        );

        if (!selected) {
          throw new Error(
            "Model feed mein nahi mila. Homepage par jaakar doosra model select karo."
          );
        }

        if (!cancelled) setModel(selected);
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(err.message || "Unable to load this model.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (requestedModel) {
      loadModel();
    } else {
      setError("No model selected. Return to the homepage.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestedModel, reload]);

  return (
    <main className="live-page">
      <header className="live-topbar">
        <a className="live-back" href="/">
          <ArrowLeft size={20} />
          <span>Home</span>
        </a>

        <a className="live-brand" href="/">
          OnlyStream<span>.</span>
        </a>

        <span className="live-status">
          <Radio size={15} /> LIVE
        </span>
      </header>

      <section className="live-content">
        <div className="live-heading">
          <span className="live-eyebrow">
            <Tv size={15} /> LIVE MODEL
          </span>

          <h1>
            Watch <span>live.</span>
          </h1>

          <p>Watch creators on OnlyStream.</p>
        </div>

        {loading ? (
          <div className="live-player-message">
            Loading model...
          </div>
        ) : error ? (
          <div className="live-player-message">
            <p>{error}</p>

            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </button>

            <p>
              <a href="/">Back to live models</a>
            </p>
          </div>
        ) : model ? (
          <>
            <article className="live-player-card">
              {/* Video remains completely separate from comments */}
              <div className="live-player">
                <AWLivePlayer
                  key={model.username}
                  username={model.username}
                />
              </div>

              {/* Comments now appear inside the model details card */}
              <div className="live-details">
                <div className="live-avatar">
                  {model.name.charAt(0).toUpperCase()}
                </div>

                <div className="live-channel-info">
                  <LiveComments
                    key={`comments-${model.username}`}
                    username={model.username}
                  />

                  <h2>{model.name}</h2>

                  <p>
                    {model.age > 0 ? `Age ${model.age}+` : "Live model"}
                  </p>

                  <span className="live-note">
                    <Eye
                      size={14}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                      }}
                    />{" "}
                    {model.viewers.toLocaleString()} watching
                  </span>
                </div>

                {model.profileUrl && (
                  <a
                    className="live-open-twitch"
                    href={model.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open provider room"
                  >
                    <ExternalLink size={18} />
                  </a>
                )}
              </div>
            </article>

            <section className="more-live">
              <h3>Explore more models</h3>
              <p>Discover other creators.</p>
              <a href="/">Browse live models →</a>
            </section>
          </>
        ) : null}

        <footer className="live-footer">
          Powered by OnlyStream
        </footer>
      </section>
    </main>
  );
}
