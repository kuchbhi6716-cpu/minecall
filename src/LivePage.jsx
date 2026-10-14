
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Eye
} from "lucide-react";
import "./LivePage.css";

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("model");

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        const response = await fetch("/api/cam4-models");

        if (!response.ok) {
          throw new Error("Could not load CAM4 models.");
        }

        const data = await response.json();

        const models = Array.isArray(data)
          ? data
          : Array.isArray(data.models)
            ? data.models
            : [];

        const selected = models.find(
          (item) =>
            (item.nickname || item.username || item.name) === username
        );

        if (!selected) {
          throw new Error(
            "This model is no longer available. Please return home."
          );
        }

        if (!cancelled) {
          setModel({
            username:
              selected.nickname || selected.username || selected.name,
            name:
              selected.nickname || selected.name || selected.username,
            age: selected.age || null,
            thumbnail:
              selected.thumb ||
              selected.thumb_big ||
              selected.profile_thumb_sfw ||
              selected.profile_thumb ||
              selected.thumb_error ||
              "",
            viewers: Number(selected.viewers) || 0,
            profileUrl: selected.link || ""
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Something went wrong.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (username) {
      loadModel();
    } else {
      setError("No model selected. Please return home.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [username]);

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

          <p>Discover live creators on OnlyStream.</p>
        </div>

        <article className="live-player-card">
          <div
            className="live-player"
            style={{
              width: "100%",
              minHeight: "320px",
              background: "#111"
            }}
          >
            {loading ? (
              <p>Loading model...</p>
            ) : error ? (
              <p>{error}</p>
            ) : model ? (
              <div
                style={{
                  width: "100%",
                  minHeight: "320px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  padding: "24px",
                  boxSizing: "border-box",
                  textAlign: "center"
                }}
              >
                {model.thumbnail && !imageError ? (
                  <img
                    src={model.thumbnail}
                    alt={`${model.name} thumbnail`}
                    onError={() => setImageError(true)}
                    style={{
                      width: "100%",
                      maxWidth: "480px",
                      maxHeight: "340px",
                      objectFit: "contain",
                      borderRadius: "12px"
                    }}
                  />
                ) : (
                  <div
                    style={{
                      color: "#aaa",
                      padding: "40px"
                    }}
                  >
                    Preview unavailable
                  </div>
                )}

                <h2 style={{ color: "white", margin: 0 }}>
                  {model.name}
                </h2>

                <p style={{ color: "#ccc", margin: 0 }}>
                  {model.age ? `${model.age}+ · ` : ""}
                  <Eye
                    size={15}
                    style={{
                      display: "inline",
                      verticalAlign: "middle"
                    }}
                  />{" "}
                  {model.viewers.toLocaleString()} watching
                </p>

                {model.profileUrl ? (
                  <a
                    className="join-btn"
                    href={model.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      textDecoration: "none"
                    }}
                  >
                    WATCH ON CAM4
                    <ExternalLink size={17} />
                  </a>
                ) : (
                  <p style={{ color: "#aaa" }}>
                    The model profile link is unavailable.
                  </p>
                )}

                <p style={{ color: "#aaa", fontSize: "13px" }}>
                  The live stream opens on CAM4.
                </p>
              </div>
            ) : null}
          </div>

          {model && (
            <div className="live-details">
              <div className="live-avatar">
                {model.name.charAt(0).toUpperCase()}
              </div>

              <div className="live-channel-info">
                <h2>{model.name}</h2>

                <p>
                  {model.age ? `Age ${model.age}+` : "Live model"}
                </p>

                <span className="live-note">
                  Availability depends on the model being online.
                </span>
              </div>

              {model.profileUrl && (
                <a
                  className="live-open-twitch"
                  href={model.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open model profile on CAM4"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
          )}
        </article>

        <section className="more-live">
          <h3>Explore more models</h3>
          <p>Discover other models who are online.</p>
          <a href="/">Browse live models →</a>
        </section>

        <footer className="live-footer">
          Powered by OnlyStream
        </footer>
      </section>
    </main>
  );
}
