
import React, { useEffect, useRef, useState } from "react";
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

  const [username, setUsername] = useState("Creator");
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [callCoins] = useState(0);

  useEffect(() => {
    try {
      const session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      if (!session || session.role !== "creator") {
        window.location.replace("/login");
        return;
      }

      setUsername(session.username || "Creator");

      const liveSession = JSON.parse(
        localStorage.getItem(LIVE_KEY) || "null"
      );

      if (liveSession?.username === session.username && liveSession.isLive) {
        // Do not restore a fake live status after refresh.
        // The camera must be started again with fresh permission.
        localStorage.removeItem(LIVE_KEY);
      }
    } catch {
      window.location.replace("/login");
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function goLive() {
    setCameraError("");
    setBusy(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Open the site using HTTPS."
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

      localStorage.setItem(
        LIVE_KEY,
        JSON.stringify({
          username: session?.username || username,
          isLive: true,
          startedAt: new Date().toISOString(),
        })
      );

      setIsLive(true);
    } catch (error) {
      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access in your browser settings."
          : error?.message || "Could not start your camera. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function endLive() {
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

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
                disabled={busy}
              >
                <Radio size={19} />
                {busy ? "Starting camera..." : "Go Live"}
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
            Your browser will ask permission before camera and microphone access.
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
              Test mode · Updates when connected billing is implemented
            </p>
          </div>

          <div className="creator-info-card">
            <div className="creator-info-icon">
              <Video size={21} />
            </div>
            <h3>How it works</h3>
            <ul>
              <li>Go Live to enable your camera preview.</li>
              <li>Your caller's video will appear after a call connects.</li>
              <li>End Live to stop your camera and microphone.</li>
            </ul>
          </div>

          <div className="creator-info-card creator-test-card">
            <div className="creator-info-icon">
              <Camera size={21} />
            </div>
            <h3>Testing version</h3>
            <p>
              Live status is currently stored in this browser only. Public
              creator cards and real-time call earnings still need backend
              integration.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
