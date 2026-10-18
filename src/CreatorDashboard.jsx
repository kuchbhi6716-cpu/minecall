
import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Coins,
  LogOut,
  Phone,
  Radio,
  ShieldCheck,
  Video,
  VideoOff,
  PhoneOff,
  Check,
  X,
} from "lucide-react";
import "./CreatorDashboard.css";

const SESSION_KEY = "onlystream-test-session-v1";
const LIVE_KEY = "onlystream-test-live-v1";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function CreatorDashboard() {
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const requestRef = useRef(null);
  const mountedRef = useRef(false);
  const isLiveRef = useRef(false);
  const acceptedRef = useRef(false);
  const connectedRef = useRef(false);

  const [username, setUsername] = useState("Creator");
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [callConnected, setCallConnected] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [callCoins] = useState(0);

  const closePeer = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    pendingCandidatesRef.current = [];
    connectedRef.current = false;
    acceptedRef.current = false;
    setCallConnected(false);
    setCallerName("");

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const createPeer = useCallback((initiator) => {
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
        event.streams?.[0] ||
        new MediaStream([event.track]);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", {
          type: "candidate",
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        connectedRef.current = true;
        setCallConnected(true);
      }

      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        setCallConnected(false);
      }
    };

    if (initiator) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.emit("signal", {
            type: "offer",
            offer: peer.localDescription,
          });
        })
        .catch((error) => {
          console.error("Creator offer error:", error);
          setCameraError("Could not start the video call. Please try again.");
        });
    }

    return peer;
  }, []);

  const handleSignal = useCallback(async (data) => {
    const peer = peerRef.current;
    if (!peer || !data) return;

    try {
      if (data.type === "offer" && data.offer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];

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

        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
      } else if (data.type === "candidate" && data.candidate) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } else {
          pendingCandidatesRef.current.push(data.candidate);
        }
      }
    } catch (error) {
      console.error("Creator signal error:", error);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    let session;

    try {
      session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      if (!session || session.role !== "creator") {
        window.location.replace("/login");
        return undefined;
      }

      setUsername(session.username || "Creator");

      const oldLive = JSON.parse(
        localStorage.getItem(LIVE_KEY) || "null"
      );

      if (oldLive?.username === session.username && oldLive.isLive) {
        localStorage.removeItem(LIVE_KEY);
      }
    } catch {
      window.location.replace("/login");
      return undefined;
    }

    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("incoming-creator-call", (request) => {
      if (!isLiveRef.current || acceptedRef.current) {
        socket.emit("creator-call-reject", {
          requestId: request?.requestId,
        });
        return;
      }

      requestRef.current = request;
      setIncomingCall(request);
    });

    socket.on("creator-call-cancelled", () => {
      requestRef.current = null;
      setIncomingCall(null);
    });

    socket.on("creator-call-rejected", () => {
      requestRef.current = null;
      setIncomingCall(null);
      setCameraError("The call request was declined or cancelled.");
    });

    socket.on("creator-call-accepted", (data) => {
      acceptedRef.current = true;
      requestRef.current = null;
      setIncomingCall(null);
      setCallerName(data?.callerName || "Caller");
    });

    socket.on("matched", (data) => {
      if (!isLiveRef.current || !acceptedRef.current) return;

      setCallerName((current) => current || "Caller");
      createPeer(Boolean(data?.initiator));
    });

    socket.on("signal", handleSignal);

    socket.on("partner-left", () => {
      closePeer();
      setIncomingCall(null);
      requestRef.current = null;
      setCameraError("The caller ended the call.");
    });

    socket.on("disconnect", () => {
      closePeer();
      setIncomingCall(null);
      requestRef.current = null;
    });

    return () => {
      mountedRef.current = false;
      isLiveRef.current = false;

      socket.removeAllListeners();
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      closePeer();
      stopLocalStream();
    };
  }, [closePeer, createPeer, handleSignal, stopLocalStream]);

  async function goLive() {
    setCameraError("");
    setBusy(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Open the website using HTTPS."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      const creatorUsername = session?.username || username;

      socketRef.current?.emit(
        "creator-go-live",
        { username: creatorUsername },
        (response) => {
          if (response?.ok === false) {
            setCameraError(
              response.message || "Could not publish your live status."
            );
          }
        }
      );

      isLiveRef.current = true;

      localStorage.setItem(
        LIVE_KEY,
        JSON.stringify({
          username: creatorUsername,
          isLive: true,
          startedAt: new Date().toISOString(),
        })
      );

      setIsLive(true);
    } catch (error) {
      stopLocalStream();

      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access in your browser settings."
          : error?.message || "Could not start your camera. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function acceptCall() {
    const request = requestRef.current;

    if (!request?.requestId || !socketRef.current) return;

    setCameraError("");
    acceptedRef.current = true;
    setCallerName(request.callerName || "Caller");
    setIncomingCall(null);

    socketRef.current.emit(
      "creator-call-accept",
      { requestId: request.requestId },
      (response) => {
        if (response?.ok === false) {
          closePeer();
          requestRef.current = null;
          setCameraError(
            response.message || "This call request is no longer available."
          );
        }
      }
    );

    requestRef.current = null;
  }

  function rejectCall() {
    const request = requestRef.current;

    if (request?.requestId) {
      socketRef.current?.emit("creator-call-reject", {
        requestId: request.requestId,
      });
    }

    requestRef.current = null;
    setIncomingCall(null);
  }

  function endCall() {
    socketRef.current?.emit("stop-chat");
    closePeer();
    setIncomingCall(null);
    requestRef.current = null;
    setCameraError("");
  }

  function endLive() {
    if (requestRef.current?.requestId) {
      socketRef.current?.emit("creator-call-reject", {
        requestId: requestRef.current.requestId,
      });
    }

    socketRef.current?.emit("creator-end-live", {
      username,
    });

    closePeer();
    setIncomingCall(null);
    requestRef.current = null;

    isLiveRef.current = false;
    stopLocalStream();

    localStorage.removeItem(LIVE_KEY);
    setIsLive(false);
    setCameraError("");
  }

  function logout() {
    socketRef.current?.emit("creator-end-live", { username });
    isLiveRef.current = false;
    closePeer();
    stopLocalStream();

    localStorage.removeItem(LIVE_KEY);
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "/";
  }

  return (
    <main className="creator-dashboard">
      <header className="creator-header">
        <a className="creator-brand" href="/">
          OnlyStream<span>.</span>
        </a>

        <button className="creator-logout" onClick={logout}>
          <LogOut size={17} />
          <span>Log out</span>
        </button>
      </header>

      <div className="creator-welcome">
        <a className="creator-back" href="/">
          <ArrowLeft size={16} />
          Home
        </a>

        <p className="creator-eyebrow">CREATOR STUDIO</p>
        <h1>Welcome, {username}</h1>
        <p className="creator-subtitle">
          Go live, accept call requests, and manage your studio.
        </p>
      </div>

      <section className="creator-dashboard-grid">
        <div className="creator-camera-panel">
          <div className="creator-panel-heading">
            <div>
              <h2>{callConnected ? "You're on a call" : "Your camera"}</h2>
              <p>
                {callConnected
                  ? `Connected with ${callerName || "caller"}`
                  : "Your camera stays ready while you wait for a call."}
              </p>
            </div>

            <span className={isLive ? "creator-status live" : "creator-status"}>
              <span className="creator-status-dot" />
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
          </div>

          <div className="creator-video-stage">
            <video
              ref={remoteVideoRef}
              className="creator-remote-video"
              autoPlay
              playsInline
            />

            <video
              ref={videoRef}
              className={
                callConnected
                  ? "creator-preview-video creator-preview-small"
                  : "creator-preview-video"
              }
              autoPlay
              muted
              playsInline
            />

            {!isLive && (
              <div className="creator-camera-placeholder">
                <div className="creator-camera-icon">
                  <CameraOff size={32} />
                </div>
                <h3>Your camera preview</h3>
                <p>Go live to turn on your camera and microphone.</p>
              </div>
            )}

            {isLive && (
              <div className="creator-live-label">
                <span />
                LIVE NOW
              </div>
            )}

            {callConnected && (
              <div className="creator-call-label">
                <Phone size={14} />
                Connected
              </div>
            )}
          </div>

          {cameraError && (
            <p className="creator-error" role="alert">
              {cameraError}
            </p>
          )}

          {incomingCall && (
            <div className="creator-incoming-call">
              <div className="creator-incoming-icon">
                <Phone size={20} />
              </div>

              <div className="creator-incoming-details">
                <strong>Incoming call</strong>
                <span>{incomingCall.callerName || "A user"} wants to call you.</span>
              </div>

              <div className="creator-incoming-actions">
                <button
                  className="creator-accept-call"
                  onClick={acceptCall}
                  aria-label="Accept call"
                >
                  <Check size={18} />
                  Accept
                </button>
                <button
                  className="creator-reject-call"
                  onClick={rejectCall}
                  aria-label="Reject call"
                >
                  <X size={18} />
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="creator-camera-actions">
            {!isLive ? (
              <button
                className="creator-go-live"
                onClick={goLive}
                disabled={busy}
              >
                <Radio size={19} />
                {busy ? "Starting camera..." : "Go Live"}
              </button>
            ) : callConnected ? (
              <button className="creator-end-live" onClick={endCall}>
                <PhoneOff size={19} />
                End Call
              </button>
            ) : (
              <button className="creator-end-live" onClick={endLive}>
                <VideoOff size={19} />
                End Live
              </button>
            )}
          </div>

          <p className="creator-camera-note">
            <ShieldCheck size={15} />
            Your browser asks permission before camera and microphone access.
          </p>
        </div>

        <aside className="creator-stats-column">
          <div className="creator-stat-card">
            <div className="creator-stat-icon">
              <Coins size={22} />
            </div>
            <p className="creator-stat-label">Coins collected this call</p>
            <div className="creator-stat-value">{callCoins}</div>
            <p className="creator-stat-footnote">
              Test mode · Billing is not connected yet.
            </p>
          </div>

          <div className="creator-info-card">
            <div className="creator-info-icon">
              <Video size={21} />
            </div>
            <h3>How it works</h3>
            <ul>
              <li>Go Live to publish your creator status.</li>
              <li>Accept an incoming call to connect video and audio.</li>
              <li>End Call to return to your live preview.</li>
              <li>End Live to stop your camera and microphone.</li>
            </ul>
          </div>

          <div className="creator-info-card creator-test-card">
            <div className="creator-info-icon">
              <Camera size={21} />
            </div>
            <h3>Testing version</h3>
            <p>
              This version uses browser-based test login. Payments, persistent
              accounts, and real earnings are not connected.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
