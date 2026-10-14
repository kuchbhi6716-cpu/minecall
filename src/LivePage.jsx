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
  return String(
    item?.performerId ||
      item?.performer_id ||
      item?.username ||
      item?.nickname ||
      item?.id ||
      item?.name ||
      ""
  ).trim();
}
function getThumbnail(item) {
  const images = [
    item?.profilePictureUrl?.size800x600,
    item?.profilePictureUrl?.size320x180,
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
        typeof image === "string" &&
        image.trim().length > 0
    ) || ""
  );
}
function extractModels(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (!response || typeof response !== "object") {
    return [];
  }
  // Actual A.W. Empire format:
  // response.data.models
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
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      const nestedLists = [
        candidate.models,
        candidate.performers,
        candidate.results,
        candidate.items,
      ];
      for (const list of nestedLists) {
        if (Array.isArray(list)) {
          return list;
        }
      }
    }
  }
  return [];
}
function normalizeModel(item) {
  const age = Number(
    item?.persons?.[0]?.age ?? item?.age ?? 0
  );
  return {
    username: getUsername(item),
    name:
      item?.displayName ||
      item?.nickname ||
      item?.username ||
      item?.performerId ||
      item?.name ||
      "Live Model",
    age: Number.isFinite(age) ? age : 0,
    thumbnail: getThumbnail(item),
    viewers: Number(
      item?.viewers ??
        item?.viewerCount ??
        item?.viewer_count ??
        item?.numViewers ??
        item?.details?.viewers ??
        0
    ) || 0,
    // A.W. Empire supplies the provider's chat-room URL.
    profileUrl:
      item?.chatRoomUrl ||
      item?.link ||
      item?.profileUrl ||
      item?.profile_url ||
      item?.url ||
      "",
    status: item?.status || "",
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
        const models = items
          .map(normalizeModel)
          .filter((item) => item.username);
        console.log(
          "OnlyStream model feed count:",
          models.length
        );
        const selected = models.find(
          (item) =>
            item.username.toLowerCase() ===
            username.trim().toLowerCase()
        );
        if (!selected) {
          throw new Error(
            "This model wasn't found in the current feed. It may have left the feed, or the selected username may have changed."
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
          <p>
            Discover live creators on OnlyStream.
          </p>
        </div>
        <article className="live-player-card">
          <div
            className="live-player"
            style={{
              width: "100%",
              minHeight: "320px",
              background: "#111",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {loading ? (
              <div
                style={{
                  minHeight: "320px",
                  display: "grid",
                  placeItems: "center",
                  color: "#ccc",
                }}
              >
                Loading model...
              </div>
            ) : error ? (
              <div
                style={{
                  padding: "32px 24px",
                  textAlign: "center",
                  color: "#fff",
                }}
              >
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
                    alt={`${model.name} preview`}
                    onError={() => setImageError(true)}
                    style={{
                      width: "100%",
                      maxWidth: "640px",
                      maxHeight: "420px",
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
                <h2
                  style={{
                    color: "#fff",
                    margin: 0,
                  }}
                >
                  {model.name}
                </h2>
                <p
                  style={{
                    color: "#ccc",
                    margin: 0,
                  }}
                >
                  {model.age > 0
                    ? `${model.age}+ · `
                    : ""}
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
                    OPEN MODEL ROOM
                    <ExternalLink size={17} />
                  </a>
                ) : (
                  <p style={{ color: "#aaa" }}>
                    No provider room link is available.
                  </p>
                )}
                <p
                  style={{
                    color: "#aaa",
                    fontSize: "13px",
                    maxWidth: "460px",
                  }}
                >
                  This is a model preview. Live video playback
                  inside OnlyStream requires a provider-approved
                  player or embed integration.
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
                  Availability depends on the provider's feed.
                </span>
              </div>
              {model.profileUrl && (
                <a
                  className="live-open-twitch"
                  href={model.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open model room"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
          )}
        </article>
        <section className="more-live">
          <h3>Explore more models</h3>
          <p>Discover other models from the feed.</p>
          <a href="/">Browse live models →</a>
        </section>
        <footer className="live-footer">
          Powered by OnlyStream
        </footer>
      </section>
    </main>
  );
}
