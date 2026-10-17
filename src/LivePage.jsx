
import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Send,
  Tv,
  Eye,
} from "lucide-react";
import "./LivePage.css";

const API_BASE = "";
const EMBED_SCRIPT = "https://edwmcr.com/embed/lf";
const COMMENT_DURATION = 6000;
const MAX_VISIBLE_COMMENTS = 12;

function getUsername(model) {
  if (!model || typeof model !== "object") return "";

  const value =
    model.username ??
    model.userName ??
    model.performer ??
    model.name ??
    model.slug ??
    model.model;

  return typeof value === "string" ? value.trim() : "";
}

function getThumbnail(model) {
  if (!model || typeof model !== "object") return "";

  return (
    model.thumbnail ??
    model.image ??
    model.preview ??
    model.avatar ??
    model.profileImage ??
    ""
  );
}

function extractModels(data) {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  for (const key of [
    "models",
    "performers",
    "data",
    "results",
    "items",
  ]) {
    if (Array.isArray(data[key])) return data[key];
  }

  if (data.data && typeof data.data === "object") {
    return extractModels(data.data);
  }

  return [];
}

function normalizeModel(model) {
  const username = getUsername(model);

  return {
    ...model,
    username,
    displayName:
      model.displayName ??
      model.title ??
      username,
    thumbnail: getThumbnail(model),
  };
}

// ------------------------------------
// PROVIDER PLAYER
// ------------------------------------

function AWLivePlayer({ username }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const loadPlayer = useCallback(() => {
    if (!username || !containerRef.current) return;

    setLoading(true);
    setError("");

    const container = containerRef.current;
    container.replaceChildren();

    const script = document.createElement("script");
    const params = new URLSearchParams();

    params.set("performer", username);
    params.append("forcedPerformers[]", username);

    script.src = `${EMBED_SCRIPT}?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      setLoading(false);
      setError("The live player could not be loaded.");
    };

    container.appendChild(script);

    const timer = window.setTimeout(() => {
      if (!containerRef.current) return;

      const player = container.querySelector(
        "iframe, video, object, embed"
      );

      if (player) {
        setLoading(false);
      }
    }, 1200);

    const observer = new MutationObserver(() => {
      const player = container.querySelector(
        "iframe, video, object, embed"
      );

      if (player) {
        setLoading(false);
        setError("");
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [username]);

  useEffect(() => {
    const cleanup = loadPlayer();

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [loadPlayer]);

  return (
    <div className="onlystream-embed-wrap">
      {loading && (
        <div className="video-skeleton">
          <div className="video-skeleton-spinner" />
          <p>Connecting to live stream…</p>
        </div>
      )}

      {error && (
        <div className="player-error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadPlayer()}
          >
            Retry
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="onlystream-embed"
      />
    </div>
  );
}

// ------------------------------------
// LIVE COMMENTS
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
  const [connectionState, setConnectionState] = useState("connecting");
  const [notice, setNotice] = useState("");

  const socketRef = useRef(null);
  const timerRefs = useRef(new Map());
  const commentsRef = useRef([]);

  const removeComment = useCallback((id) => {
    const timer = timerRefs.current.get(id);

    if (timer) {
      window.clearTimeout(timer);
      timerRefs.current.delete(id);
    }

    commentsRef.current = commentsRef.current.filter(
      (comment) => comment.id !== id
    );

    setComments([...commentsRef.current]);
  }, []);

  useEffect(() => {
    const socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketRef.current = socket;

    const joinRoom = () => {
      setConnectionState("connected");
      socket.emit("live-join", username);
    };

    socket.on("connect", joinRoom);

    socket.on("disconnect", () => {
      setConnectionState("connecting");
    });

    socket.on("connect_error", () => {
      setConnectionState("offline");
    });

    socket.on("live-joined", () => {
      setConnectionState("connected");
    });

    socket.on("live-comment", (comment) => {
      if (!comment?.id || !comment?.message) return;

      // Avoid rendering duplicate events.
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
          ...comment,
          receivedAt: Date.now(),
        },
      ].slice(-MAX_VISIBLE_COMMENTS);

      // Clear timers for comments trimmed from the visible list.
      const visibleIds = new Set(next.map((item) => item.id));

      for (const [id, timer] of timerRefs.current.entries()) {
        if (!visibleIds.has(id)) {
          window.clearTimeout(timer);
          timerRefs.current.delete(id);
        }
      }

      commentsRef.current = next;
      setComments(next);

      const timer = window.setTimeout(() => {
        removeComment(comment.id);
      }, COMMENT_DURATION);

      timerRefs.current.set(comment.id, timer);
    });

    socket.on("live-error", (text) => {
      setNotice(String(text || "Unable to post comment."));
      window.setTimeout(() => setNotice(""), 3000);
    });

    if (socket.connected) joinRoom();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();

      for (const timer of timerRefs.current.values()) {
        window.clearTimeout(timer);
      }

      timerRefs.current.clear();
      commentsRef.current = [];
      socketRef.current = null;
    };
  }, [username, removeComment]);

  function submitComment(event) {
    event.preventDefault();

    const name = guestName.trim().replace(/\s+/g, " ");
    const text = message.trim().replace(/\s+/g, " ");

    if (!name) {
      setNotice("Enter a guest name first.");
      return;
    }

    if (!text) return;

    if (name.length > 24 || text.length > 180) {
      setNotice("Name or comment is too long.");
      return;
    }

    if (!socketRef.current?.connected) {
      setNotice("Reconnecting. Please try again.");
      return;
    }

    try {
      localStorage.setItem("onlystream-guest-name", name);
    } catch {
      // Local storage may be unavailable in private browsing.
    }

    socketRef.current.emit("live-comment", {
      name,
      message: text,
    });

    setMessage("");
    setNotice("");
  }

  return (
    <>
      <div className="live-comment-overlay" aria-live="polite">
        {comments.map((comment) => (
          <div className="live-floating-comment" key={comment.id}>
            <span className="live-comment-name">
              {comment.name}
            </span>
            <span className="live-comment-message">
              {comment.message}
            </span>
          </div>
        ))}
      </div>

      <div className="live-comment-composer">
        <form
          className="live-comment-form"
          onSubmit={submitComment}
        >
          <input
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="Guest name"
            aria-label="Guest name"
            maxLength={24}
          />

          <div className="live-comment-input-row">
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Say something…"
              aria-label="Live comment"
              maxLength={180}
            />

            <button
              type="submit"
              aria-label="Send comment"
              disabled={!message.trim()}
            >
              <Send size={17} />
            </button>
          </div>
        </form>

        <div className="live-comment-status">
          <span
            className={
              connectionState === "connected"
                ? "live-status-dot is-online"
                : "live-status-dot"
            }
          />
          <span>
            {connectionState === "connected"
              ? "Live chat"
              : connectionState === "offline"
                ? "Reconnecting…"
                : "Connecting…"}
          </span>

          {notice && (
            <span className="live-comment-notice">
              {notice}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ------------------------------------
// LIVE PAGE
// ------------------------------------

export default function LivePage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    let active = true;

    async function fetchModels() {
      try {
        const response = await fetch("/api/aw-models");

        if (!response.ok) {
          throw new Error("Could not load live models.");
        }

        const data = await response.json();

        if (!active) return;

        const list = extractModels(data)
          .map(normalizeModel)
          .filter((model) => model.username);

        setModels(list);

        const params = new URLSearchParams(window.location.search);
        const requested = (
          params.get("model") || ""
        ).trim().toLowerCase();

        const match = list.find(
          (model) =>
            model.username.toLowerCase() === requested
        );

        setSelectedModel(match || list[0] || null);
      } catch (err) {
        if (active) {
          setError(err.message || "Something went wrong.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchModels();

    return () => {
      active = false;
    };
  }, []);

  const username = selectedModel?.username || "";

  return (
    <main className="live-page">
      <header className="live-header">
        <a href="/" className="live-back-link">
          <ArrowLeft size={18} />
          <span>OnlyStream</span>
        </a>

        <div className="live-header-status">
          <Radio size={15} />
          <span>LIVE</span>
        </div>
      </header>

      <section className="live-content">
        <div className="live-heading">
          <div>
            <p className="live-eyebrow">
              <Tv size={14} /> LIVE STREAMS
            </p>
            <h1>Watch Live</h1>
            <p className="live-subtitle">
              Watch a stream and chat with other viewers.
            </p>
          </div>
        </div>

        {loading && (
          <div className="live-page-message">
            Loading live streams…
          </div>
        )}

        {error && (
          <div className="live-page-message">
            {error}
          </div>
        )}

        {!loading && !error && !selectedModel && (
          <div className="live-page-message">
            No live streams are available right now.
          </div>
        )}

        {selectedModel && (
          <>
            <article className="live-player-card">
              <div className="live-player">
                <AWLivePlayer username={username} />

                <LiveComments
                  key={username}
                  username={username}
                />
              </div>

              <div className="live-details">
                <div className="live-avatar">
                  {(selectedModel.displayName || username)
                    .slice(0, 1)
                    .toUpperCase()}
                </div>

                <div className="live-channel-info">
                  <h2>{selectedModel.displayName || username}</h2>

                  <p>
                    <Eye size={14} />
                    {" "}
                    {selectedModel.viewers ??
                      selectedModel.viewersCount ??
                      "Live now"}
                  </p>

                  <span className="live-note">
                    You are watching as a guest.
                  </span>
                </div>

                <a
                  className="live-open-twitch"
                  href={`https://www.google.com/search?q=${encodeURIComponent(username)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Find stream information"
                >
                  <ExternalLink size={17} />
                </a>
              </div>
            </article>

            {models.length > 1 && (
              <section className="live-explore">
                <h2>Explore more streams</h2>

                <div className="live-explore-grid">
                  {models
                    .filter((model) => model.username !== username)
                    .slice(0, 8)
                    .map((model) => (
                      <button
                        type="button"
                        className="live-explore-card"
                        key={model.username}
                        onClick={() => {
                          const url = new URL(
                            window.location.href
                          );

                          url.searchParams.set(
                            "model",
                            model.username
                          );

                          window.history.pushState(
                            {},
                            "",
                            url
                          );

                          setSelectedModel(model);
                        }}
                      >
                        {model.thumbnail ? (
                          <img
                            src={model.thumbnail}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <div className="live-explore-placeholder">
                            <Tv size={22} />
                          </div>
                        )}

                        <span>{model.displayName}</span>
                      </button>
                    ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>

      <footer className="live-footer">
        OnlyStream · Respect other viewers.
      </footer>
    </main>
  );
}
