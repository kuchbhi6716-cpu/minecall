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
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";
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
        if (Array.isArray(candidate[key])) {
          return candidate[key];
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
        0
    ) || 0,
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
  };
}
function AWLivePlayer({ username }) {
  const [playerError, setPlayerError] = useState(false);
  useEffect(() => {
    if (!username) return;
    const container = document.getElementById(
      "onlystream-player"
    );
    if (!container) return;
    container.replaceChildren();
    setPlayerError(false);
    const script = document.createElement("script");
    script.async = true;
    const params = new URLSearchParams({
      c: "onlystream-player",
      site: "jasmin",
      psid: "kuchbhi6677",
      pstool: "202_1",
      psprogram: "revs",
      category: "girl",
      ms_notrack: "1",
    });
    // Pass the selected performer to the generated feed.
    params.append("forcedPerformers[]", username);
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;
    script.onerror = () => {
      setPlayerError(true);
    };
    container.appendChild(script);
    return () => {
      container.replaceChildren();
    };
  }, [username]);
  return (
    <div className="onlystream-embed-wrap">
      <div
        id="onlystream-player"
        className="onlystream-embed"
      />
      {playerError && (
        <p className="player-error">
          The player couldn't load. Check the provider's
          embed settings and performer selection format.
        </p>
      )}
    </div>
  );
}
export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("model") || "";
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function loadModel() {
      setLoading(true);
      setError("");
      setModel(null);
      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(
            `Model feed request failed (${response.status}).`
          );
        }
        const data = await response.json();
        const selected = extractModels(data)
          .map(normalizeModel)
          .find(
            (item) =>
              item.username.toLowerCase() ===
              username.trim().toLowerCase()
          );
        if (!selected) {
          throw new Error(
            "This model was not found in the current feed."
          );
        }
        if (!cancelled) setModel(selected);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Couldn't load this model.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (username) {
      loadModel();
    } else {
      setError("No model selected. Return to the homepage.");
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
          <p>Watch creators on OnlyStream.</p>
        </div>
        {loading ? (
          <div className="live-player-message">
            Loading model...
          </div>
        ) : error ? (
          <div className="live-player-message">
            <p>{error}</p>
            <a href="/">Back to live models</a>
          </div>
        ) : model ? (
          <>
            <article className="live-player-card">
              <div className="live-player">
                <AWLivePlayer key={model.username} username={model.username} />
              </div>
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
                    <Eye
                      size={14}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                      }}
                    />{" "}
                    {model.viewers.toLocaleString()} watching
                  </span>
                </div>
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
            <section className="more-live">
              <h3>Explore more models</h3>
              <p>Discover other creators.</p>
              <a href="/">Browse live models →</a>
            </section>
          </>
        ) : null}
        <footer className="live-footer">
          Powered by OnlyStream
        </footer>
      </section>
    </main>
  );
}
