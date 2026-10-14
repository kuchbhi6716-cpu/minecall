import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Eye,
} from "lucide-react";
import "./LivePage.css";
const API_URL = "/api/aw-models";
function getUsername(item) {
  return (
    item?.nickname ||
    item?.username ||
    item?.performerId ||
    item?.performer_id ||
    item?.id ||
    item?.name ||
    ""
  );
}

function getThumbnail(item) {
  const images = [
    item?.thumbnail,
    item?.thumb,
    item?.thumb_big,
    item?.profile_thumb_sfw,
    item?.profile_thumb,
    item?.image,
    item?.imageUrl,
    item?.image_url,
    item?.images?.["800x600"],
    item?.images?.["320x180"],
    item?.images?.large,
    item?.images?.medium,
  ];
  return (
    images.find(
      (image) =>
        typeof image === "string" && image.trim()
    ) || ""
  );
}
function extractModels(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.models,
    data.performers,
    data.results,
    data.data,
    data.items,
    data.model,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      if (Array.isArray(candidate.models)) return candidate.models;
      if (Array.isArray(candidate.performers)) return candidate.performers;
      if (Array.isArray(candidate.results)) return candidate.results;
      if (Array.isArray(candidate.items)) return candidate.items;
    }
  }
  return [];
}
function normalizeModel(item) {
  return {
    username: String(getUsername(item)),
    name:
      item?.nickname ||
      item?.name ||
      item?.username ||
      "Live Model",
    age: Number(item?.age) || 0,
    thumbnail: getThumbnail(item),
    viewers:
      Number(
        item?.viewers ??
        item?.viewerCount ??
        item?.viewer_count ??
        item?.numViewers ??
        0
      ) || 0,
    // The model feed may not provide a usable profile URL.
    profileUrl:
      item?.link ||
      item?.profileUrl ||
      item?.profile_url ||
      item?.url ||
      "",
  };
}
export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("model") || "";
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function loadModel() {
      setLoading(true);
      setError("");
      setModel(null);
      setImageError(false);
      try {
        const response = await fetch(API_URL, {
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(
            `Model feed request failed (${response.status}).`
          );
        }
        const data = await response.json();
        const items = extractModels(data);
        const models = items.map(normalizeModel);
        const selected = models.find(
          (item) =>
            item.username.toLowerCase() === username.toLowerCase()
        );
        if (!selected) {
          throw new Error(
            "This model wasn't found in the current feed. It may have gone offline or the feed may use a different username field."
          );
        }
        if (!cancelled) {
          setModel(selected);
        }
      } catch (err) {
        console.error("OnlyStream LivePage error:", err);
        if (!cancelled) {
          setError(
            err.message || "Couldn't load this model."
          );
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
              background: "#111",
            }}
          >
            {loading ? (
              <p>Loading model...</p>
            ) : error ? (
              <div style={{ padding: "24px", textAlign: "center" }}>
                <p>{error}</p>
                <a href="/">Back to live models</a>
              </div>
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
                  textAlign: "center",
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
                      borderRadius: "12px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      color: "#aaa",
                      padding: "40px",
                    }}
                  >
                    Preview unavailable
                  </div>
                )}
                <h2 style={{ color: "white", margin: 0 }}>
                  {model.name}
                </h2>
                <p style={{ color: "#ccc", margin: 0 }}>
                  {model.age > 0 ? `${model.age}+ · ` : ""}
                  <Eye
                    size={15}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
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
                      textDecoration: "none",
                    }}
                  >
                    WATCH LIVE
                    <ExternalLink size={17} />
                  </a>
                ) : (
                  <p style={{ color: "#aaa" }}>
                    The provider hasn't supplied a profile link.
                  </p>
                )}
                <p style={{ color: "#aaa", fontSize: "13px" }}>
                  Live playback depends on the provider's supported
                  player or embed options.
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
                  {model.age > 0
                    ? `Age ${model.age}+`
                    : "Live model"}
                </p>
                <span className="live-note">
                  Availability depends on the provider's current feed.
                </span>
              </div>
              {model.profileUrl && (
                <a
                  className="live-open-twitch"
                  href={model.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open model profile"
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
