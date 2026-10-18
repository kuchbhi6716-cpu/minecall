
import Home from "./Home";
import LivePage from "./LivePage";
import CategoryPage from "./CategoryPage";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SkipForward,
  PhoneOff,
  RotateCw,
  Send,
  Maximize2,
} from "lucide-react";

const SESSION_KEY = "onlystream-test-session-v1";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function CallPage() {
  const params = new URLSearchParams(window.location.search);
  const creatorUsername = params.get("creator")?.trim() || "";
  const isCreatorCall = Boolean(creatorUsername);

  const [status, setStatus] = useState("Ready when you are");
  const [phase, setPhase] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const socketRef = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const pendingCandidates = useRef([]);
  const pendingSignals = useRef([]);
  const activeRef = useRef(false);
  const requestPendingRef = useRef(false);
  const typingTimeout = useRef(null);
  const typingRef = useRef(false);
  const messagesArea = useRef(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const signalLockRef = useRef(false);

  const cleanupPeer = useCallback(() => {
    const peer = peerRef.current;

    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
      peerRef.current = null;
    }

    pendingCandidates.current = [];
    pendingSignals.current = [];
    signalLockRef.current = false;

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }
  }, []);

  const resetCall = useCallback(
    (newStatus = "Ready when you are") => {
      activeRef.current = false;
      requestPendingRef.current = false;
      generationRef.current += 1;

      cleanupPeer();
      stopMedia();

      setPhase("idle");
      setMessages([]);
      setMessage("");
      setPartnerTyping(false);
      setMuted(false);
      setCameraOff(false);
      setStatus(newStatus);
    },
    [cleanupPeer, stopMedia]
  );

  const handleSignal = useCallback(async (data) => {
    if (!data || !["offer", "answer", "candidate"].includes(data.type)) {
      return;
    }

    // FIX: do not discard a signal just because matched has not
    // created the RTCPeerConnection yet.
    if (!peerRef.current) {
      pendingSignals.current.push(data);
      return;
    }

    // Serialize incoming signaling so candidates and SDP are processed
    // in order rather than racing one another.
    if (signalLockRef.current) {
      pendingSignals.current.push(data);
      return;
    }

    signalLockRef.current = true;

    try {
      const peer = peerRef.current;
      if (!peer) {
        pendingSignals.current.push(data);
        return;
      }

      if (data.type === "offer" && data.offer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        const candidates = pendingCandidates.current.splice(0);
        for (const candidate of candidates) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socketRef.current?.emit("signal", {
          type: "answer",
          answer: peer.localDescription,
        });
      } else if (data.type === "answer" && data.answer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );

        const candidates = pendingCandidates.current.splice(0);
        for (const candidate of candidates) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else if (data.type === "candidate" && data.candidate) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } else {
          pendingCandidates.current.push(data.candidate);
        }
      }
    } catch (error) {
      console.error("[WebRTC] Signal processing failed:", error);
      setStatus(
        "WebRTC signaling failed. End the call and try again."
      );
    } finally {
      signalLockRef.current = false;

      // Drain signals that arrived while an SDP operation was running.
      if (pendingSignals.current.length && peerRef.current) {
        const next = pendingSignals.current.shift();
        if (next) {
          queueMicrotask(() => {
            void handleSignal(next);
          });
        }
      }
    }
  }, []);

  const createPeer = useCallback((socket, initiator) => {
    if (peerRef.current) return peerRef.current;

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, streamRef.current);
      });
    }

    peer.ontrack = (event) => {
      const remoteStream =
        event.streams?.[0] || new MediaStream([event.track]);

      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStream;
        remoteVideo.current.play().catch((error) => {
          console.warn("[WebRTC] Remote video autoplay blocked:", error);
        });
      }

      setStatus("Remote media received. Establishing connection...");
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          type: "candidate",
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log("[WebRTC] connectionState:", peer.connectionState);
      console.log("[WebRTC] iceConnectionState:", peer.iceConnectionState);

      if (peer.connectionState === "connected") {
        setPhase("connected");
        setStatus("Video connection established.");
      } else if (peer.connectionState === "failed") {
        setPhase("waiting");
        setStatus(
          "WebRTC connection failed. A TURN server may be needed for this network."
        );
      } else if (peer.connectionState === "disconnected") {
        setStatus("Connection interrupted. Waiting for recovery...");
      } else if (peer.connectionState === "closed") {
        setPhase("idle");
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE state:", peer.iceConnectionState);
    };

    if (initiator) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          socket.emit("signal", {
            type: "offer",
            offer: peer.localDescription,
          });
        })
        .catch((error) => {
          console.error("[WebRTC] Offer creation failed:", error);
          setStatus("Could not create a video offer. Please try again.");
        });
    }

    return peer;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
      setStatus("Connected to server. Ready when you are.");
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error);
      setStatus("Server connection failed. Please try again.");
    });

    socket.on("waiting", () => {
      if (!activeRef.current || isCreatorCall) return;
      setPhase("waiting");
      setStatus("Looking for someone new...");
    });

    socket.on("matched", (data = {}) => {
      console.log("[Socket] Matched:", data);

      if (!activeRef.current) {
        console.warn("[WebRTC] Ignoring match because call is inactive.");
        return;
      }

      if (isCreatorCall && requestPendingRef.current) {
        console.warn("[WebRTC] Waiting for creator-call acceptance.");
        return;
      }

      const peer = createPeer(socket, Boolean(data.initiator));

      setPhase("waiting");
      setStatus(
        isCreatorCall
          ? `Connecting to ${creatorUsername}...`
          : "Matched. Establishing video connection..."
      );

      // FIX: process any offer/candidate that arrived before this peer
      // was created by the matched event.
      const queuedSignals = pendingSignals.current.splice(0);

      queuedSignals.forEach((signal) => {
        queueMicrotask(() => {
          void handleSignal(signal);
        });
      });

      if (!peer) {
        setStatus("Could not initialize the video connection.");
      }
    });

    socket.on("creator-call-accepted", (data = {}) => {
      console.log("[Socket] Creator call accepted:", data);
      requestPendingRef.current = false;
      activeRef.current = true;
      setPhase("waiting");
      setStatus(
        `Call accepted by ${data.creatorUsername || creatorUsername}. Connecting...`
      );
    });

    socket.on("creator-call-rejected", (data = {}) => {
      console.log("[Socket] Creator call rejected:", data);
      requestPendingRef.current = false;
      resetCall(
        data.message ||
          data.reason ||
          `${creatorUsername} declined the call or is unavailable.`
      );
    });

    socket.on("creator-call-request-cancelled", (data = {}) => {
      console.log("[Socket] Creator call cancelled:", data);
      resetCall("The call request was cancelled.");
    });

    socket.on("creator-call-cancelled", () => {
      resetCall("The call request was cancelled.");
    });

    socket.on("signal", (data) => {
      console.log("[WebRTC] Signal received:", data?.type);
      void handleSignal(data);
    });

    socket.on("chat-message", (text) => {
      setMessages((old) => [
        ...old,
        {
          id: `${Date.now()}-${Math.random()}`,
          text: String(text).slice(0, 1000),
          own: false,
        },
      ]);
    });

    socket.on("typing", (value) => {
      setPartnerTyping(Boolean(value));
    });

    socket.on("partner-left", () => {
      console.log("[Socket] Partner left.");
      resetCall(
        isCreatorCall
          ? `${creatorUsername} ended the call.`
          : "They left. Tap Start Chatting to meet someone new."
      );
    });

    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      clearTimeout(typingTimeout.current);

      socket.removeAllListeners();
      socket.disconnect();

      cleanupPeer();
      stopMedia();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [
    cleanupPeer,
    createPeer,
    handleSignal,
    isCreatorCall,
    creatorUsername,
    resetCall,
    stopMedia,
  ]);

  useEffect(() => {
    if (!messagesArea.current) return;

    messagesArea.current.scrollTo({
      top: messagesArea.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, partnerTyping]);

  async function startChat() {
    if (activeRef.current || requestPendingRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Open this website over HTTPS to use your camera.");
      return;
    }

    if (!socketRef.current?.connected) {
      setStatus("Connecting to server. Please try again in a moment.");
      return;
    }

    let session = null;

    if (isCreatorCall) {
      try {
        session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      } catch {
        session = null;
      }

      if (!session || session.role !== "user") {
        const next = `/call?creator=${encodeURIComponent(creatorUsername)}`;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }
    }

    const generation = ++generationRef.current;

    try {
      setStatus("Waiting for camera permission...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      if (!mountedRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        localVideo.current.play().catch(() => {});
      }

      activeRef.current = true;

      if (isCreatorCall) {
        requestPendingRef.current = true;
        setPhase("waiting");
        setStatus(`Calling ${creatorUsername}...`);

        socketRef.current.emit(
          "creator-call-request",
          {
            username: creatorUsername,
            callerName: session?.username || "User",
          },
          (response) => {
            if (!response?.ok) {
              console.error("[Creator call] Request failed:", response);
              resetCall(
                response?.error ||
                  response?.message ||
                  `${creatorUsername} is unavailable right now.`
              );
            } else {
              console.log("[Creator call] Request sent:", response.requestId);
              setStatus(
                response.message ||
                  `Call request sent to ${creatorUsername}.`
              );
            }
          }
        );
      } else {
        setPhase("waiting");
        setStatus("Finding your next conversation...");
        socketRef.current.emit("find-stranger");
      }
    } catch (error) {
      console.error("[Media] Could not start camera:", error);
      activeRef.current = false;
      requestPendingRef.current = false;

      setStatus(
        error?.name === "NotAllowedError"
          ? "Allow camera and microphone access, then try again."
          : error?.message || "Could not start your camera."
      );
    }
  }

  function nextStranger() {
    if (isCreatorCall) {
      stopChat();
      return;
    }

    if (!activeRef.current) {
      void startChat();
      return;
    }

    cleanupPeer();
    pendingSignals.current = [];
    setMessages([]);
    setMessage("");
    setPartnerTyping(false);
    setPhase("waiting");
    setStatus("Finding someone new...");
    socketRef.current?.emit("find-stranger");
  }

  function stopChat() {
    if (isCreatorCall && requestPendingRef.current) {
      socketRef.current?.emit("creator-call-cancel");
    }

    socketRef.current?.emit("stop-chat");
    resetCall("Chat stopped. Ready when you are.");
  }

  function handleMessageChange(event) {
    const value = event.target.value;
    setMessage(value);

    if (phase !== "connected") return;

    if (!typingRef.current) {
      typingRef.current = true;
      socketRef.current?.emit("typing", true);
    }

    clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      typingRef.current = false;
      socketRef.current?.emit("typing", false);
    }, 900);
  }

  function sendMessage(event) {
    event.preventDefault();

    const text = message.trim();
    if (!text || phase !== "connected") return;

    clearTimeout(typingTimeout.current);
    typingRef.current = false;

    socketRef.current?.emit("typing", false);
    socketRef.current?.emit("chat-message", text);

    setMessages((old) => [
      ...old,
      {
        id: `${Date.now()}-${Math.random()}`,
        text,
        own: true,
      },
    ]);

    setMessage("");
  }

  function toggleMute() {
    const next = !muted;

    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });

    setMuted(next);
  }

  function toggleCamera() {
    const next = !cameraOff;

    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });

    setCameraOff(next);
  }

  async function switchCamera() {
    if (!streamRef.current || phase === "idle") return;

    const currentFacing =
      streamRef.current.getVideoTracks()[0]?.getSettings()?.facingMode;
    const nextFacing = currentFacing === "environment" ? "user" : "environment";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false,
      });

      const newTrack = newStream.getVideoTracks()[0];
      const oldTrack = streamRef.current.getVideoTracks()[0];

      if (!newTrack) {
        newStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const sender = peerRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");

      if (sender) await sender.replaceTrack(newTrack);

      if (oldTrack) {
        streamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }

      streamRef.current.addTrack(newTrack);

      if (localVideo.current) {
        localVideo.current.srcObject = streamRef.current;
      }

      setCameraOff(false);
    } catch (error) {
      console.error("[Media] Camera switch failed:", error);
      setStatus("Couldn't switch camera on this device.");
    }
  }

  async function toggleFullscreen() {
    const video = remoteVideo.current;
    if (!video) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (video.requestFullscreen) {
        await video.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch (error) {
      console.error("[Video] Fullscreen failed:", error);
    }
  }

  const isActive = phase !== "idle";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="OnlyStream home">
          Only<span>Stream</span><i>.</i>
        </a>

        <div className="topbar-right">
          <span className="online-dot" />
          <span className="topbar-label">
            {isCreatorCall ? "CREATOR VIDEO CALL" : "MEET SOMEONE NEW"}
          </span>
        </div>
      </header>

      <main className="layout">
        <section className="video-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {isCreatorCall ? "YOUR CREATOR CALL" : "YOUR NEXT CONVERSATION"}
              </p>

              <h1>
                {isCreatorCall ? (
                  <>
                    Call <br />
                    <span>{creatorUsername}</span>
                  </>
                ) : (
                  <>
                    Strangers today.
                    <br />
                    <span>Stories tomorrow.</span>
                  </>
                )}
              </h1>
            </div>

            <div className={`status-pill ${phase}`}>
              <span className="status-dot" />
              {phase === "connected"
                ? "Connected"
                : phase === "waiting"
                ? "Waiting"
                : "Ready"}
            </div>
          </div>

          <p className="call-status-text" role="status">
            {status}
          </p>

          <div className="video-grid">
            <div className="video-card remote-card">
              <video
                ref={remoteVideo}
                autoPlay
                playsInline
                className="video-feed"
              />

              {phase !== "connected" && (
                <div className="video-placeholder">
                  <div className="placeholder-orb">
                    <span>{phase === "waiting" ? "✳" : "✦"}</span>
                  </div>

                  <h2>
                    {phase === "waiting"
                      ? isCreatorCall
                        ? `Waiting for ${creatorUsername}`
                        : "Finding your person"
                      : isCreatorCall
                      ? "Ready to call your creator"
                      : "Your next hello awaits"}
                  </h2>

                  <p>
                    {phase === "waiting"
                      ? "Keep this page open while the connection is being made."
                      : isCreatorCall
                      ? "Tap Call Creator to send a request."
                      : "Tap Start Chatting to meet someone new."}
                  </p>

                  {phase === "waiting" && (
                    <div className="search-loader">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
              )}

              <div className="video-top-label">
                <span className="camera-icon">◉</span>
                {isCreatorCall ? creatorUsername : "STRANGER"}
              </div>

              <div className="video-bottom-label">
                <span className="live-dot" />
                {phase === "connected" ? "LIVE" : "WAITING FOR CONNECTION"}
              </div>

              {phase === "connected" && (
                <button
                  type="button"
                  className="fullscreen-button"
                  onClick={toggleFullscreen}
                  aria-label="Fullscreen remote video"
                >
                  <Maximize2 size={17} />
                </button>
              )}
            </div>

            <div className="video-card local-card">
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                className={`video-feed local-feed ${cameraOff ? "camera-off" : ""}`}
              />

              {(!isActive || cameraOff) && (
                <div className="local-placeholder">
                  <span>YOU</span>
                  <div className="self-avatar" />
                  <p>{cameraOff ? "Camera is off" : "Your preview"}</p>
                </div>
              )}

              <span className="local-label">YOU</span>
            </div>
          </div>

          <div className="controls-panel">
            <div className="primary-controls">
              <button
                className="start-button"
                onClick={startChat}
                disabled={isActive}
                type="button"
              >
                <Video size={19} strokeWidth={2.2} />
                <span>{isCreatorCall ? "Call Creator" : "Start Chatting"}</span>
              </button>

              <button
                className="next-button"
                onClick={nextStranger}
                disabled={!isActive || isCreatorCall}
                type="button"
              >
                <SkipForward size={19} />
                <span>Next</span>
              </button>

              <button
                className="stop-button"
                onClick={stopChat}
                disabled={!isActive}
                type="button"
              >
                <PhoneOff size={19} />
                <span>End Call</span>
              </button>
            </div>

            <div className="secondary-controls">
              <button
                className={`utility-button ${muted ? "utility-active" : ""}`}
                onClick={toggleMute}
                disabled={!isActive}
                type="button"
              >
                {muted ? <MicOff size={17} /> : <Mic size={17} />}
                <span>{muted ? "Unmute" : "Mute"}</span>
              </button>

              <button
                className={`utility-button ${cameraOff ? "utility-active" : ""}`}
                onClick={toggleCamera}
                disabled={!isActive}
                type="button"
              >
                {cameraOff ? <VideoOff size={17} /> : <Video size={17} />}
                <span>{cameraOff ? "Camera on" : "Camera off"}</span>
              </button>

              <button
                className="utility-button"
                onClick={switchCamera}
                disabled={!isActive}
                type="button"
              >
                <RotateCw size={17} strokeWidth={2.2} />
                <span>Flip camera</span>
              </button>
            </div>
          </div>

          <div className="privacy-note">
            <span>◇</span>
            Be kind!
          </div>
        </section>

        <aside className="chat-panel">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">SAY SOMETHING</p>
              <h2>
                Live chat <span>✳</span>
              </h2>
            </div>
            <div className="chat-count">{messages.length}</div>
          </div>

          <div className="chat-status">
            <span className={`status-dot ${phase}`} />
            {phase === "connected"
              ? "You're connected"
              : "Messages unlock when you connect"}
          </div>

          <div className="messages-area" ref={messagesArea}>
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="chat-art">✉</div>
                <h3>Your conversation starts here</h3>
              </div>
            ) : (
              messages.map((item) => (
                <div
                  className={`message-row ${item.own ? "own-message" : ""}`}
                  key={item.id}
                >
                  <div className="message-bubble">{item.text}</div>
                  <span className="message-author">
                    {item.own
                      ? "YOU"
                      : isCreatorCall
                      ? creatorUsername
                      : "STRANGER"}
                  </span>
                </div>
              ))
            )}

            {partnerTyping && (
              <div className="typing-row">
                <div className="typing-bubble" aria-label="Partner is typing">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="typing-label">PARTNER IS TYPING</span>
              </div>
            )}
          </div>

          <form className="chat-form" onSubmit={sendMessage}>
            <input
              value={message}
              onChange={handleMessageChange}
              placeholder={phase === "connected" ? "Write a message..." : "Connect first..."}
              maxLength={1000}
              disabled={phase !== "connected"}
              aria-label="Chat message"
            />

            <button
              type="submit"
              disabled={phase !== "connected" || !message.trim()}
              aria-label="Send message"
            >
              <Send size={18} strokeWidth={2.2} />
            </button>
          </form>
        </aside>
      </main>

      <footer className="footer">
        <span>OnlyStream © {new Date().getFullYear()}</span>
        <span>Made for spontaneous connections <b /></span>
      </footer>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path === "/call" || path.startsWith("/call/")) {
    return <CallPage />;
  }

  if (path === "/live") {
    return <LivePage />;
  }

  if (path.startsWith("/category/")) {
    return <CategoryPage />;
  }

  return <Home />;
}
