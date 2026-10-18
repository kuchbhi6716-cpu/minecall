
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Coins,
  LogOut,
  Radio,
  ShieldCheck,
  Video,
  VideoOff,
} from "lucide-react";
import "./CreatorDashboard.css";

const SESSION_KEY = "onlystream-test-session-v1";
const LIVE_KEY = "onlystream-test-live-v1";

export default function CreatorDashboard() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);

  const [username, setUsername] = useState("Creator");
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [callCoins] = useState(0);

  useEffect(() => {
    let session;

    try {
      session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      if (!session || session.role !== "creator") {
        window.location.replace("/login");
        return;
      }

      setUsername(session.username || "Creator");

      // A refresh must not pretend that the camera is still live.
      localStorage.removeItem(LIVE_KEY);
    } catch {
      window.location.replace("/login");
      return;
    }

    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setServerConnected(true);
      setCameraError("");
    });

    socket.on("disconnect", () => {
      setServerConnected(false);
      setIsLive(false);
      localStorage.removeItem(LIVE_KEY);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraError(
        "Server connection lost. Your live session has stopped. Reconnect and go live again."
      );
    });

    socket.on("connect_error", () => {
      setServerConnected(false);
    });

    socket.on("creator-live-replaced", () => {
      setIsLive(false);
      localStorage.removeItem(LIVE_KEY);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraError(
        "This creator username was opened in another session. Start a new live session if needed."
      );
    });

    return () => {
      // Tell the server to remove this creator from the live list.
      if (socket.connected) {
        socket.emit("creator-end-live");
      }

      socket.disconnect();
      socketRef.current = null;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      localStorage.removeItem(LIVE_KEY);
    };
  }, []);

  async function goLive() {
    setCameraError("");

    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setCameraError(
        "Not connected to the server yet. Wait a moment and try again."
      );
      return;
    }

    setBusy(true);
    let stream;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Open OnlyStream over HTTPS."
        );
      }

      stream = await navigator.mediaDevices.getUserMedia({
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

      // Register this creator with the server.
      const result = await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("The server did not confirm your live session."));
        }, 8000);

        socket.emit(
          "creator-go-live",
          { username },
          (response) => {
            window.clearTimeout(timeout);

            if (!response?.ok) {
              reject(
                new Error(response?.error || "Could not start your live session.")
              );
              return;
            }

            resolve(response);
          }
        );
      });

      localStorage.setItem(
        LIVE_KEY,
        JSON.stringify({
          username,
          isLive: true,
          startedAt: result.creator?.startedAt || new Date().toISOString(),
        })
      );

      setIsLive(true);
    } catch (error) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      streamRef.current = null;

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setIsLive(false);
      localStorage.removeItem(LIVE_KEY);

      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access in your browser settings."
          : error?.message || "Could not start your live session. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function endLive() {
    const socket = socketRef.current;

    if (socket?.connected) {
      socket.emit("creator-end-live");
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    localStorage.removeItem(LIVE_KEY);
    setIsLive(false);
    setCameraError("");
  }

  function logout() {
    endLive();

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

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
          Manage your live camera and keep an eye on your call earnings.
        </p>
      </div>

      <section className="creator-dashboard-grid">
        <div className="creator-camera-panel">
          <div className="creator-panel-heading">
            <div>
              <h2>Your camera</h2>
              <p>Your preview is visible to you while waiting for a call.</p>
            </div>

            <span className={isLive ? "creator-status live" : "creator-status"}>
              <span className="creator-status-dot" />
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
          </div>

          <div className="creator-video-stage">
            <video
              ref={videoRef}
              className="creator-preview-video"
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
          </div>

          {cameraError && (
            <p className="creator-error" role="alert">
              {cameraError}
            </p>
          )}

          <div className="creator-camera-actions">
            {!isLive ? (
              <button
                className="creator-go-live"
                onClick={goLive}
                disabled={busy || !serverConnected}
              >
                <Radio size={19} />
                {busy
                  ? "Starting camera..."
                  : !serverConnected
                    ? "Connecting to server..."
                    : "Go Live"}
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
            Camera permission is requested before going live.
          </p>

          <p className="creator-camera-note">
            <span
              className="creator-status-dot"
              style={{
                background: serverConnected ? "#39d98a" : "#ff6464",
              }}
            />
            {serverConnected
              ? "Connected to OnlyStream server"
              : "Connecting to OnlyStream server"}
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
              Test mode · Call billing is not connected yet.
            </p>
          </div>

          <div className="creator-info-card">
            <div className="creator-info-icon">
              <Video size={21} />
            </div>
            <h3>How it works</h3>
            <ul>
              <li>Go Live to publish your status to the server.</li>
              <li>Your camera preview stays visible to you.</li>
              <li>End Live to stop your camera and microphone.</li>
            </ul>
          </div>

          <div className="creator-info-card creator-test-card">
            <div className="creator-info-icon">
              <Camera size={21} />
            </div>
            <h3>Testing version</h3>
            <p>
              Live status is held in server memory. A server restart clears
              the live list. Video calls and earnings are not connected yet.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
