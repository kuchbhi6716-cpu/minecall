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
  ArrowUpRight,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";
const COMMENT_DURATION = 12000;
const MAX_VISIBLE_COMMENTS = 12;

// ------------------------------------
// PROVIDER CONNECTION
// ------------------------------------

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

// ------------------------------------
// MODEL HELPERS
// ------------------------------------

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
            "Player load nahi hua. Provider embed settings check karo."
          );
        }
      }, 20000);
    };

    script.onerror = () => {
      if (!cancelled) {
        setPlayerError(
          "Player script load nahi hua. Connection check karke retry karo."
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
        style={{
          width: "100%",
          height: "100%",
          minHeight: 0,
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
          <Radio size={26} />
          <p>{playerError}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={15} />
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
        window.setTimeout(() => removeComment(comment.id), COMMENT_DURATION)
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
        // Continue if storage is unavailable.
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
      <div className="live-comment-composer">
        <form className="live-comment-form" onSubmit={chat.sendComment}>
          <input
            type="text"
            value={chat.guestName}
            onChange={(event) => chat.setGuestName(event.target.value)}
            placeholder="Your guest name"
            aria-label="Guest name"
            maxLength={24}
            autoComplete="nickname"
          />

          <div className="live-comment-input-row">
            <input
              type="text"
              value={chat.message}
              onChange={(event) => chat.setMessage(event.target.value)}
              placeholder="Write a comment..."
              aria-label="Write a live comment"
              maxLength={180}
            />

            <button
              type="submit"
              aria-label="Send comment"
              disabled={!chat.message.trim()}
            >
              <Send size={16} />
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
          {chat.notice && (
            <span className="live-comment-notice">{chat.notice}</span>
          )}
        </div>
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

      <span className="live-recommendation-info">
        <span className="live-recommendation-status">
          <span className="live-recommendation-dot" />
          LIVE NOW
        </span>

        <span className="live-recommendation-name">{item.name}</span>
      </span>
    </button>
  );
}

// ------------------------------------
// ABOUT + CONTACT FOOTER
// ------------------------------------

function LiveFooter() {
  return (
    <footer className="live-footer site-footer">
      <div className="footer-main">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>

        <p className="footer-tagline">
          Meet respectfully. Connect safely.
        </p>
      </div>

      <div className="footer-about">
        <section className="footer-about-card">
          <h3>About OnlyStream</h3>
          <p>
            OnlyStream is a platform built to help people discover live
            creators and connect with others through online conversations.
          </p>
        </section>

        <section className="footer-about-card">
          <h3>About the Owner</h3>
          <p>
            OnlyStream is an independent online project. The goal is to build
            a simple and accessible place to discover live streams and
            connect with others.
          </p>
        </section>

        <section className="footer-about-card footer-contact">
          <h3>Contact</h3>
          <p>
            Have a question, suggestion, or business enquiry? Get in touch.
          </p>

          <a href="mailto:kuchbhi6716@gmail.com">
            kuchbhi6716@gmail.com
            <ArrowUpRight size={16} />
          </a>
        </section>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} OnlyStream</span>
        <span>Meet respectfully. Connect safely.</span>
      </div>
    </footer>
  );
}

// ------------------------------------
// PAGE
// ------------------------------------


function SubscriptionCreatorExperience() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("subscriptionCreator") || "Creator";
  const price = Math.max(1, Number(params.get("subscriptionPrice")) || 499);
  // Ask for the demo fee on every new visit. This avoids old localStorage test flags
  // silently bypassing the payment popup while the demo purchase flow is being tested.
  const [unlocked, setUnlocked] = useState(false);
  const [showPayment, setShowPayment] = useState(true);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [messages, setMessages] = useState([{ id: 1, name: "OnlyStream", text: "Welcome! Keep chat respectful." }]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [streamStatus, setStreamStatus] = useState("Connecting to creator live…");
  const viewerVideoRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const [media, setMedia] = useState(() => { try { return JSON.parse(localStorage.getItem(`onlystream-media-${username}`) || "[]"); } catch { return []; } });

  useEffect(() => {
    if (!unlocked) return undefined;
    let disposed = false;
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const closePeer = () => {
      if (peerRef.current) { try { peerRef.current.close(); } catch {} peerRef.current = null; }
      pendingCandidatesRef.current = [];
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    };
    const join = () => socket.emit("subscription-live-join", { username }, (result) => {
      if (disposed) return;
      if (!result?.ok) setStreamStatus(result?.error || "Creator is not live right now. Please try again later.");
      else setStreamStatus("Connecting to live video…");
    });
    socket.on("connect", join);
    socket.on("subscription-live-ready", () => { if (!disposed) setStreamStatus("Creator is live. Connecting video…"); });
    socket.on("subscription-live-signal", async (payload) => {
      if (disposed || !payload || String(payload.username || "").toLowerCase() !== username.toLowerCase()) return;
      try {
        if (payload.type === "offer" && payload.offer) {
          closePeer();
          const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] });
          peerRef.current = peer;
          peer.ontrack = (event) => {
            if (disposed || !viewerVideoRef.current) return;
            const [remoteStream] = event.streams;
            if (remoteStream) viewerVideoRef.current.srcObject = remoteStream;
            setStreamStatus("LIVE NOW");
            const playResult = viewerVideoRef.current.play();
            if (playResult?.catch) playResult.catch(() => setStreamStatus("Tap the video to start playback."));
          };
          peer.onicecandidate = (event) => {
            if (event.candidate && socket.connected) socket.emit("subscription-live-signal", { username, targetSocketId: payload.fromSocketId, type: "candidate", candidate: event.candidate });
          };
          peer.onconnectionstatechange = () => {
            if (peer.connectionState === "connected") setStreamStatus("LIVE NOW");
            else if (["failed", "disconnected", "closed"].includes(peer.connectionState)) setStreamStatus("Video connection interrupted. Waiting to reconnect…");
          };
          await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
          for (const candidate of pendingCandidatesRef.current) { try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch {} }
          pendingCandidatesRef.current = [];
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("subscription-live-signal", { username, targetSocketId: payload.fromSocketId, type: "answer", answer: peer.localDescription });
        } else if (payload.type === "candidate" && payload.candidate) {
          if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          else pendingCandidatesRef.current.push(payload.candidate);
        }
      } catch (error) {
        console.warn("Subscription viewer video setup failed:", error);
        setStreamStatus("Could not connect to the live video. Refresh and try again.");
      }
    });
    socket.on("subscription-chat-message", (item) => {
      if (disposed || String(item?.username || "").toLowerCase() !== username.toLowerCase()) return;
      setMessages((old) => [...old, { id: item.id || `${Date.now()}-${Math.random()}`, name: item.name || "Subscriber", text: String(item.text || "").slice(0, 500) }]);
    });
    socket.on("disconnect", () => { if (!disposed) setStreamStatus("Reconnecting to live stream…"); });
    socket.on("connect_error", () => { if (!disposed) setStreamStatus("Server connection failed. Please refresh and retry."); });
    if (socket.connected) join();
    return () => {
      disposed = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      closePeer();
    };
  }, [unlocked, username]);

  async function payDemo() {
    if (paymentBusy) return;
    setPaymentBusy(true);
    setNotice("");
    const purchase = {
      username,
      amount: price,
      transactionId: `${username.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    let purchaseSocket = socketRef.current;
    let temporarySocket = false;
    try {
      if (!purchaseSocket?.connected) {
        purchaseSocket = io({ transports: ["websocket", "polling"] });
        temporarySocket = true;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Payment server timed out. Please try again.")), 10000);
          purchaseSocket.once("connect", () => { clearTimeout(timeout); resolve(); });
          purchaseSocket.once("connect_error", (error) => { clearTimeout(timeout); reject(error || new Error("Could not connect to payment server.")); });
        });
      }
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Payment confirmation timed out. Please try again.")), 10000);
        purchaseSocket.emit("subscription-purchase", purchase, (response) => {
          clearTimeout(timeout);
          if (response?.ok) resolve(response);
          else reject(new Error(response?.error || "Demo payment could not be recorded."));
        });
      });
      if (result?.ok) {
        setUnlocked(true);
        setShowPayment(false);
        setNotice(`Demo payment of ₹${price} recorded for ${username}. This is not a real payment.`);
      }
    } catch (error) {
      setNotice(error?.message || "Demo payment failed. Please try again.");
    } finally {
      if (temporarySocket && purchaseSocket) purchaseSocket.disconnect();
      setPaymentBusy(false);
    }
  }
  function sendMessage(e) { e.preventDefault(); const text = message.trim(); if (!text || !unlocked) return; const socket = socketRef.current; if (!socket?.connected) { setNotice("Chat is reconnecting. Please try again in a moment."); return; } socket.emit("subscription-chat-message", { username, name: "Subscriber", text }); setMessage(""); }
  return <main className="subscription-live-page"><header className="subscription-live-topbar"><a href="/">← Home</a><a href="/" className="subscription-live-brand">OnlyStream<span>.</span></a><span className="subscription-live-badge">SUBSCRIPTION</span></header>
    <section className="subscription-live-heading"><span className="subscription-pill">LIFETIME ACCESS</span><h1>{username}</h1><p>Creator subscription · One-time demo payment · No call coins required for viewing</p></section>
    {notice && <p className="subscription-access-notice">{notice}</p>}
    <section className="subscription-live-layout"><div className="subscription-live-main"><div className="subscription-big-player">{unlocked ? <div className="subscription-player-placeholder subscription-player-live"><video ref={viewerVideoRef} autoPlay playsInline className="subscription-viewer-live-video" aria-label={`${username} live video`} /><div className="subscription-viewer-stream-status"><span className="subscription-live-dot"/><span className="subscription-pill">{streamStatus}</span></div></div> : <div className="subscription-locked-player"><span>🔒</span><h2>Subscriber-only live</h2><p>Unlock lifetime access to watch this creator's live streams, photos and videos.</p><button onClick={() => setShowPayment(true)}>Unlock for ₹{price}</button></div>}</div>
      <div className="subscription-content-panel"><div className="subscription-content-title"><div><span className="subscription-pill">SUBSCRIPTION CONTENT</span><h2>Photos & videos</h2></div><span>{unlocked ? media.length + " items" : "Locked"}</span></div>{!unlocked ? <p className="subscription-content-locked">Pay once to unlock the creator's gallery for lifetime access.</p> : media.length ? <div className="subscription-viewer-gallery">{media.map(item => <article key={item.id}>{item.type === "video" ? <video src={item.data} controls playsInline/> : <img src={item.data} alt={item.name || "Creator photo"}/>}<span>{item.type === "video" ? "VIDEO" : "PHOTO"}</span></article>)}</div> : <p className="subscription-content-locked">No photos or videos have been uploaded by this creator yet.</p>}</div></div>
      <aside className="subscription-viewer-chat"><div className="subscription-chat-heading"><div><span>LIVE COMMUNITY</span><h2>Live chat</h2></div><span className="subscription-chat-online">● DEMO</span></div><div className="subscription-chat-messages">{messages.map(item => <div className="subscription-chat-message" key={item.id}><strong>{item.name}</strong><p>{item.text}</p></div>)}</div><form onSubmit={sendMessage} className="subscription-chat-form"><input value={message} onChange={e => setMessage(e.target.value)} placeholder={unlocked ? "Write a message…" : "Unlock to join chat"} disabled={!unlocked}/><button disabled={!unlocked || !message.trim()}>Send</button></form><div className="subscription-no-calls"><strong>Subscription access</strong><p>Watching content is included after the one-time payment. Creator calls remain separate and are not included.</p></div></aside></section>
    {showPayment && <div className="subscription-payment-backdrop" role="presentation"><section className="subscription-payment-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-payment-title"><button className="subscription-modal-close" onClick={() => setShowPayment(false)} aria-label="Close payment popup">×</button><span className="subscription-pill">ONE-TIME PAYMENT</span><h2 id="subscription-payment-title">Unlock {username}</h2><p>Pay once for lifetime access to this creator's subscriber content and live streams.</p><div className="subscription-payment-price"><span>Lifetime access</span><strong>₹{price}</strong><small>Demo payment · No real money charged</small></div><ul><li>Watch subscriber live streams</li><li>Access uploaded photos and videos</li><li>No recurring subscription fee</li><li>Paid calls are not included</li></ul><button className="subscription-demo-pay-button" onClick={payDemo} disabled={paymentBusy}>{paymentBusy ? "Recording demo payment…" : `Pay ₹${price} · Demo`}</button><button className="subscription-cancel-payment" onClick={() => setShowPayment(false)}>Maybe later</button></section></div>}
  </main>;
}

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

  if (params.has("subscriptionCreator")) return <SubscriptionCreatorExperience />;

  const recommendations = models.filter(
    (item) =>
      item.username.toLowerCase() !==
      (model?.username || "").toLowerCase()
  );

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
          <Radio size={15} />
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
                    Discover another creator and jump straight into their
                    live stream.
                  </p>
                </div>

                <span className="live-recommendations-count">
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

        <LiveFooter />
      </section>
    </main>
  );
}
