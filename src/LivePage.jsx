
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Send,
  RefreshCw,
  MessageCircle,
  Users,
  ShieldCheck,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";
const COMMENT_DURATION = 12000;
const MAX_VISIBLE_COMMENTS = 12;

function warmUpProvider() {
  ["https://atwmcd.com", "https://edwmcr.com"].forEach((url) => {
    if (document.querySelector(`link[rel="preconnect"][href="${url}"]`)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = url;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  });
}

function getUsername(item) {
  return String(
    item?.performerId ||
      item?.performer_id ||
      item?.username ||
      item?.nickname ||
      item?.id ||
      item?.displayName ||
      item?.name ||
      ""
  ).trim();
}

function normalizeImageUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "";

  const value = url.trim();
  return value.startsWith("//") ? `https:${value}` : value;
}

function getModelThumbnail(item) {
  const picture = item?.profilePictureUrl;

  if (picture && typeof picture === "object") {
    return normalizeImageUrl(
      picture.size320x180 ||
        picture.size800x600 ||
        picture.url ||
        ""
    );
  }

  const candidates = [
    item?.thumbnail,
    item?.thumbnailUrl,
    item?.thumbnail_url,
    item?.preview,
    item?.previewUrl,
    item?.preview_url,
    item?.image,
    item?.imageUrl,
    item?.image_url,
    item?.avatar,
    item?.avatarUrl,
    item?.avatar_url,
    item?.snapshot,
    item?.thumb,
    item?.profileImage,
    item?.profile_image,
    typeof picture === "string" ? picture : "",
  ];

  const image = candidates.find(
    (value) => typeof value === "string" && value.trim()
  );

  return normalizeImageUrl(image || "");
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

function isExplicitlyOffline(item) {
  const status = String(
    item?.status || item?.state || item?.availability || ""
  ).toLowerCase();

  if (
    item?.isOnline === false ||
    item?.is_online === false ||
    item?.online === false ||
    item?.isLive === false ||
    item?.is_live === false ||
    item?.live === false
  ) {
    return true;
  }

  return ["offline", "off", "disconnected", "not_live", "not-live"].includes(
    status
  );
}

function normalizeModel(item) {
  const username = getUsername(item);

  return {
    ...item,
    username,
    name: String(
      item?.displayName ||
        item?.display_name ||
        item?.name ||
        item?.nickname ||
        username ||
        "Live Model"
    ),
    thumbnail: getModelThumbnail(item),
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
    status: String(item?.status || ""),
  };
}

function getLiveModels(response) {
  const seen = new Set();

  return extractModels(response)
    .filter((item) => item && typeof item === "object")
    .filter((item) => !isExplicitlyOffline(item))
    .map(normalizeModel)
    .filter((item) => {
      if (!item.username) return false;

      const key = item.username.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

// ------------------------------------
// LIVE PLAYER
// ------------------------------------

function AWLivePlayer({ username }) {
  const [retry, setRetry] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    warmUpProvider();

    const container = containerRef.current;

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
    params.set("vp[showPerformerName]", "false");
    params.set("vp[showPerformerStatus]", "false");
    params.set("ms_notrack", "1");
    params.set("subAffId", "");
    params.set("forcedPerformers[]", username);

    const script = document.createElement("script");
    script.async = true;
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;

    function cleanup() {
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      observer = null;
    }

    function checkPlayer() {
      if (cancelled) return false;

      const player = container.querySelector("iframe, video, object, embed");

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
            "The player is taking too long to load. Check the provider or retry."
          );
        }
      }, 20000);
    };

    script.onerror = () => {
      if (!cancelled) {
        setPlayerError(
          "The player script could not load. Check your connection and retry."
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
        ref={containerRef}
        id="object_container"
        className="onlystream-embed"
      />

      {!playerReady && !playerError && (
        <div className="video-skeleton" aria-live="polite">
          <div className="skeleton-glow" />

          <div className="skeleton-content">
            <div className="skeleton-orb">
              <Radio size={24} />
            </div>
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
          <div className="player-error-icon">
            <Radio size={25} />
          </div>
          <h3>Stream unavailable</h3>
          <p>{playerError}</p>

          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={16} />
            Retry player
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------
// LIVE CHAT STATE
// ------------------------------------

function useLiveComments(username) {
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
    if (!username) {
      setComments([]);
      commentsRef.current = [];
      setChatStatus("Select a model");
      return undefined;
    }

    const socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketRef.current = socket;

    function joinLiveRoom() {
      setChatStatus("Joining chat...");
      socket.emit("live-join", username);
    }

    function handleDisconnect() {
      setChatStatus("Reconnecting...");
    }

    function handleConnectError() {
      setChatStatus("Chat unavailable");
    }

    function handleJoined() {
      setChatStatus("Live chat connected");
    }

    function handleError(payload) {
      showNotice(
        typeof payload === "string"
          ? payload
          : payload?.message || "Unable to send comment."
      );
    }

    function handleComment(comment) {
      if (
        !comment ||
        typeof comment.id !== "string" ||
        typeof comment.message !== "string"
      ) {
        return;
      }

      if (commentsRef.current.some((item) => item.id === comment.id)) {
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

      timersRef.current.set(
        comment.id,
        window.setTimeout(() => {
          removeComment(comment.id);
        }, COMMENT_DURATION)
      );
    }

    socket.on("connect", joinLiveRoom);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("live-joined", handleJoined);
    socket.on("live-error", handleError);
    socket.on("live-comment", handleComment);

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

  const sendComment = useCallback(
    (event) => {
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
        // Continue if browser storage is unavailable.
      }

      socketRef.current.emit("live-comment", {
        name,
        message: text,
      });

      setMessage("");
      setNotice("");
    },
    [guestName, message, showNotice]
  );

  return {
    guestName,
    setGuestName,
    message,
    setMessage,
    comments,
    chatStatus,
    notice,
    sendComment,
  };
}

// ------------------------------------
// FLOATING COMMENTS
// ------------------------------------

function LiveCommentOverlay({ comments }) {
  return (
    <div
      className="live-comment-overlay"
      aria-live="polite"
      aria-relevant="additions"
    >
      {comments.map((comment) => (
        <div className="live-floating-comment" key={comment.id}>
          <span className="live-comment-name">{comment.name}</span>{" "}
          <span className="live-comment-message">{comment.message}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------
// COMMENT COMPOSER
// ------------------------------------

function LiveCommentComposer({ chat }) {
  return (
    <div className="live-comments-card">
      <div className="live-chat-heading">
        <div className="live-chat-heading-icon">
          <MessageCircle size={17} />
        </div>

        <div>
          <h3>Live chat</h3>
          <p>Join the conversation</p>
        </div>
      </div>

      <form className="live-comment-form" onSubmit={chat.sendComment}>
        <label className="live-input-label" htmlFor="live-guest-name">
          Guest name
        </label>

        <input
          id="live-guest-name"
          type="text"
          value={chat.guestName}
          onChange={(event) => chat.setGuestName(event.target.value)}
          placeholder="Enter your name"
          maxLength={24}
          autoComplete="nickname"
        />

        <label className="live-input-label" htmlFor="live-comment-message">
          Your comment
        </label>

        <div className="live-comment-input-row">
          <input
            id="live-comment-message"
            type="text"
            value={chat.message}
            onChange={(event) => chat.setMessage(event.target.value)}
            placeholder="Write a comment..."
            maxLength={180}
          />

          <button
            type="submit"
            aria-label="Send comment"
            disabled={!chat.message.trim()}
          >
            <Send size={17} />
          </button>
        </div>
      </form>

      <div className="live-comment-status">
        <span
          className={`live-status-dot ${
            chat.chatStatus === "Live chat connected" ? "is-online" : ""
          }`}
        />

        <span>{chat.chatStatus}</span>
      </div>

      {chat.notice && (
        <div className="live-comment-notice" role="status">
          {chat.notice}
        </div>
      )}

      <div className="live-chat-safety">
        <ShieldCheck size={14} />
        <span>Be respectful. Keep personal information private.</span>
      </div>
    </div>
  );
}

// ------------------------------------
// RECOMMENDATION CARD
// ------------------------------------

function LiveRecommendationCard({ item }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [item.thumbnail]);

  function openModel() {
    window.location.href =
      "/live?model=" + encodeURIComponent(item.username);
  }

  return (
    <button
      type="button"
      className="live-explore-card"
      onClick={openModel}
      aria-label={`Watch ${item.name} live`}
    >
      {!imageError && item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={`${item.name} thumbnail`}
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="live-explore-placeholder">
          <Radio size={28} />
        </span>
      )}

      <span className="live-explore-shade" />

      <span className="live-recommendation-info">
        <span className="live-recommendation-status">
          <span className="live-recommendation-dot" />
          LIVE NOW
        </span>

        <span className="live-recommendation-name">{item.name}</span>

        <span className="live-recommendation-action">
          Watch stream <ExternalLink size={13} />
        </span>
      </span>
    </button>
  );
}

// ------------------------------------
// PAGE
// ------------------------------------

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const requestedModel = (params.get("model") || "").trim();

  const [model, setModel] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadModels() {
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
        const liveModels = getLiveModels(data);

        if (cancelled) return;

        setModels(liveModels);

        const target = requestedModel.toLowerCase();

        const selected = liveModels.find(
          (item) =>
            item.username.toLowerCase() === target ||
            item.name.toLowerCase() === target
        );

        if (!selected) {
          throw new Error(
            "Model feed mein nahi mila. Homepage par jaakar doosra model select karo."
          );
        }

        setModel(selected);
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(err.message || "Unable to load this model.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (requestedModel) {
      loadModels();
    } else {
      setModels([]);
      setError("No model selected. Return to the homepage.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestedModel, reload]);

  const chat = useLiveComments(model?.username || "");

  const recommendations = models.filter(
    (item) =>
      item.username.toLowerCase() !==
      (model?.username || "").toLowerCase()
  );

  return (
    <main className="live-page">
      <header className="live-topbar">
        <a className="live-back" href="/" aria-label="Back to homepage">
          <ArrowLeft size={19} />
          <span>Home</span>
        </a>

        <a className="live-brand" href="/">
          OnlyStream<span>.</span>
        </a>

        <span className="live-status">
          <span className="live-status-dot is-online" />
          LIVE
        </span>
      </header>

      <section className="live-content">
        <div className="live-heading">
          <span className="live-eyebrow">
            <Tv size={15} />
            LIVE MODEL
          </span>

          <h1>
            Watch <span>live.</span>
          </h1>

          <p>Discover live creators and join the conversation.</p>
        </div>

        {loading ? (
          <div className="live-player-message">
            <div className="live-loading-spinner" />
            <h3>Finding your stream</h3>
            <p>Connecting to the live model feed...</p>
          </div>
        ) : error ? (
          <div className="live-player-message live-error-card">
            <div className="player-error-icon">
              <Radio size={25} />
            </div>

            <h3>Unable to open this stream</h3>
            <p>{error}</p>

            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              <RefreshCw size={16} />
              Try again
            </button>

            <a className="live-secondary-link" href="/">
              <ArrowLeft size={15} />
              Back to live models
            </a>
          </div>
        ) : model ? (
          <>
            <div className="live-stream-titlebar">
              <div className="live-stream-avatar">
                {model.thumbnail ? (
                  <img src={model.thumbnail} alt="" />
                ) : (
                  <Radio size={22} />
                )}
              </div>

              <div className="live-stream-title">
                <span className="live-stream-kicker">NOW STREAMING</span>
                <h2>{model.name}</h2>
              </div>

              <span className="live-viewer-badge">
                <Radio size={14} />
                Live
              </span>
            </div>

            <article className="live-player-card">
              <div className="live-player">
                <AWLivePlayer
                  key={model.username}
                  username={model.username}
                />

                <LiveCommentOverlay comments={chat.comments} />
              </div>

              <div className="live-details live-details-chat">
                <LiveCommentComposer chat={chat} />

                {model.profileUrl && (
                  <a
                    className="live-open-twitch"
                    href={model.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open provider room"
                  >
                    <ExternalLink size={18} />
                    <span>Open original room</span>
                  </a>
                )}
              </div>
            </article>

            <section className="more-live live-recommendations">
              <div className="live-recommendations-heading">
                <div>
                  <span className="live-recommendations-eyebrow">
                    KEEP EXPLORING
                  </span>

                  <h3>More live models</h3>

                  <p>
                    Find another creator and jump into their live stream.
                  </p>
                </div>

                <span className="live-recommendations-count">
                  <Users size={15} />
                  {recommendations.length} available
                </span>
              </div>

              {recommendations.length === 0 ? (
                <p className="live-recommendations-empty">
                  No other live models are available right now.
                </p>
              ) : (
                <div className="live-explore-grid">
                  {recommendations.map((item) => (
                    <LiveRecommendationCard
                      key={item.username.toLowerCase()}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        <footer className="live-footer">
          <a href="/" className="live-footer-brand">
            OnlyStream<span>.</span>
          </a>
          <p>Meet respectfully. Connect safely.</p>
          <span>© {new Date().getFullYear()} OnlyStream</span>
        </footer>
      </section>
    </main>
  );
}
