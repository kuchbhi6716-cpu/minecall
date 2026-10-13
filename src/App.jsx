import { useEffect, useRef, useState } from "react";
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
  Maximize2
} from "lucide-react";

export default function App() {
  const [status, setStatus] = useState("Ready when you are");
  const [phase, setPhase] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState("user");
  const [expanded, setExpanded] = useState(false);

  const socketRef = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const pendingCandidates = useRef([]);
  const activeRef = useRef(false);
  const messagesEnd = useRef(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("waiting", () => {
      setPhase("waiting");
      setStatus("Looking for someone new...");
    });

    socket.on("matched", async ({ initiator }) => {
      if (!activeRef.current) return;

      cleanupPeer();
      const peer = createPeer(socket);
      peerRef.current = peer;

      setPhase("connected");
      setStatus("You're connected!");

      try {
        if (initiator) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.emit("signal", {
            type: "offer",
            offer: peer.localDescription
          });
        }
      } catch (error) {
        console.error("Offer error:", error);
        setStatus("Couldn't start the call. Try Next.");
      }
    });

    socket.on("signal", async (data) => {
      const peer = peerRef.current;
      if (!peer || !data) return;

      try {
        if (data.type === "offer") {
          await peer.setRemoteDescription(data.offer);
          await flushCandidates(peer);

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);

          socket.emit("signal", {
            type: "answer",
            answer: peer.localDescription
          });
        } else if (data.type === "answer") {
          await peer.setRemoteDescription(data.answer);
          await flushCandidates(peer);
        } else if (data.type === "candidate" && data.candidate) {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(data.candidate);
          } else {
            pendingCandidates.current.push(data.candidate);
          }
        }
      } catch (error) {
        console.error("Signaling error:", error);
      }
    });

    socket.on("chat-message", (text) => {
      setMessages((old) => [
        ...old,
        { id: crypto.randomUUID(), text, own: false }
      ]);
    });

    socket.on("partner-left", () => {
  // Allow the user to start a new chat again
  activeRef.current = false;
  cleanupPeer();
  stopMedia();
  setPhase("idle");
  setStatus("They left. Tap Start Chatting to meet someone new.");
  setMessages([]);
  setMessage("");
  setMuted(false);
  setCameraOff(false);
});

    return () => {
      activeRef.current = false;
      cleanupPeer();
      stopMedia();
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages]);

  function createPeer(socket) {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    streamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, streamRef.current);
    });

    peer.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          type: "candidate",
          candidate: event.candidate
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("Live connection established");
      } else if (peer.connectionState === "failed") {
        setStatus("Connection failed. Try Next.");
      }
    };

    return peer;
  }

  async function flushCandidates(peer) {
    const candidates = pendingCandidates.current.splice(0);
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  }

  function cleanupPeer() {
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidates.current = [];

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
  }

  function stopMedia() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }
  }

  async function startChat() {
    if (activeRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Open this site over HTTPS to use your camera.");
      return;
    }

    try {
      setStatus("Waiting for camera permission...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true
      });

      streamRef.current = stream;
      activeRef.current = true;

      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }

      setPhase("waiting");
      setStatus("Finding your next conversation...");
      socketRef.current.emit("find-stranger");
    } catch (error) {
      console.error("Media permission error:", error);
      setStatus("Allow camera and microphone access, then try again.");
    }
  }

  function nextStranger() {
    if (!activeRef.current) {
      startChat();
      return;
    }

    cleanupPeer();
    setMessages([]);
    setPhase("waiting");
    setStatus("Finding someone new...");
    socketRef.current.emit("find-stranger");
  }

  function stopChat() {
    activeRef.current = false;
    socketRef.current.emit("stop-chat");
    cleanupPeer();
    stopMedia();

    setPhase("idle");
    setMessages([]);
    setStatus("Chat stopped. Ready when you are?");
    setMuted(false);
    setCameraOff(false);
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = message.trim();

    if (!text || phase !== "connected") return;

    socketRef.current.emit("chat-message", text);
    setMessages((old) => [
      ...old,
      { id: crypto.randomUUID(), text, own: true }
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

    const nextFacing = facing === "user" ? "environment" : "user";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false
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

      if (sender) {
        await sender.replaceTrack(newTrack);
      }

      if (oldTrack) {
        streamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }

      streamRef.current.addTrack(newTrack);

      if (localVideo.current) {
        localVideo.current.srcObject = streamRef.current;
      }

      setFacing(nextFacing);
      setCameraOff(false);
    } catch (error) {
      console.error("Camera switch error:", error);
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
      console.error("Fullscreen error:", error);
    }
  }

  const isActive = phase !== "idle";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RandomCall home">
          Random<span>Call</span><i>.</i>
        </a>

        <div className="topbar-right">
          <span className="online-dot" />
          <span className="topbar-label">MEET SOMEONE NEW</span>
        </div>
      </header>

      <main className="layout">
        <section className="video-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR NEXT CONVERSATION</p>
              <h1>Strangers today.<br /><span>Stories tomorrow.</span></h1>
            </div>

            <div className={`status-pill ${phase}`}>
              <span className="status-dot" />
              {phase === "connected"
                ? "Connected"
                : phase === "waiting"
                ? "Searching"
                : "Ready"}
            </div>
          </div>

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
                      ? "Finding your person"
                      : "Your next hello awaits"}
                  </h2>
                  <p>
                    {phase === "waiting"
                      ? "Hang tight. A new connection is just around the corner."
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
                STRANGER
              </div>

              <button
                className="icon-button expand-button"
                onClick={toggleFullscreen}
                aria-label="Expand stranger video"
                type="button"
              >
                ⛶
              </button>

              <div className="video-bottom-label">
                <span className="live-dot" />
                {phase === "connected" ? "LIVE" : "WAITING FOR CONNECTION"}
              </div>
            </div>

            <div className={`video-card local-card ${expanded ? "local-card-expanded" : ""}`}>
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                onClick={() => setExpanded((value) => !value)}
                className={`video-feed local-feed ${cameraOff ? "camera-off" : ""}`}
                />

              {(!isActive || cameraOff) && (
                <div className="local-placeholder">
                  <span>YOU</span>
                  <div className="self-avatar">☺</div>
                  <p>{cameraOff ? "Camera is off" : "Your preview"}</p>
                </div>
              )}

              <span className="local-label">YOU</span>
              <button
                className={`mini-control ${muted ? "control-off" : ""}`}
                onClick={toggleMute}
                type="button"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? "Mic off" : "Mic on"}
              </button>
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
<span>Start Chatting</span>
              </button>

              <button
                className="next-button"
                onClick={nextStranger}
                disabled={!isActive}
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
<span>Stop</span>
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
                ◉ {cameraOff ? "Camera on" : "Camera off"}
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
            Be kind, protect your privacy, and never share sensitive details.
          </div>
        </section>

        <aside className="chat-panel">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">SAY SOMETHING</p>
              <h2>Live chat <span>✳</span></h2>
            </div>
            <div className="chat-count">{messages.length}</div>
          </div>

          <div className="chat-status">
            <span className={`status-dot ${phase}`} />
            {phase === "connected"
              ? "You're chatting with a stranger"
              : "Messages unlock when you connect"}
          </div>

          <div className="messages-area">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="chat-art">✉</div>
                <h3>Your conversation starts here</h3>
                <p>Say hello, share a laugh, or ask a fun question.</p>
              </div>
            ) : (
              messages.map((item) => (
                <div
                  className={`message-row ${item.own ? "own-message" : ""}`}
                  key={item.id}
                >
                  <div className="message-bubble">{item.text}</div>
                  <span className="message-author">
                    {item.own ? "YOU" : "STRANGER"}
                  </span>
                </div>
              ))
            )}
            <div ref={messagesEnd} />
          </div>

          <form className="chat-form" onSubmit={sendMessage}>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                phase === "connected" ? "Write a message..." : "Connect first..."
              }
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

          <p className="chat-footnote">
            <span>⌁</span> Keep it friendly. Keep it respectful.
          </p>
        </aside>
      </main>

      <footer className="footer">
        <span>RandomCall © 2026</span>
        <span>Made for spontaneous connections <b>✳</b></span>
      </footer>
    </div>
  );
}
