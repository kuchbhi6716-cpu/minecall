import React, { useEffect, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  Radio,
  Eye,
} from "lucide-react";
import "./Home.css";
const API_URL = "/api/aw-models";
const REFRESH_INTERVAL = 45000;
function getModelUsername(model) {
  return String(
    model?.performerId ||
      model?.performer_id ||
      model?.username ||
      model?.nickname ||
      model?.id ||
      model?.name ||
      ""
  ).trim();
}
function getModelName(model) {
  return (
    model?.displayName ||
    model?.nickname ||
    model?.username ||
    model?.performerId ||
    model?.name ||
    "Live Model"
  );
}
function getModelThumbnail(model) {
  const images = [
    model?.profilePictureUrl?.size320x180,
    model?.profilePictureUrl?.size800x600,
    model?.thumbnail,
    model?.thumb,
    model?.thumb_big,
    model?.profile_thumb_sfw,
    model?.profile_thumb,
    model?.image,
    model?.imageUrl,
    model?.image_url,
    model?.images?.["320x180"],
    model?.images?.["800x600"],
    model?.images?.medium,
    model?.images?.large,
    model?.imageSizes?.["320x180"],
    model?.imageSizes?.["800x600"],
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
  // Actual A.W. Empire response:
  // { status: "OK", data: { models: [...] } }
  const possibleLists = [
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
  for (const list of possibleLists) {
    if (Array.isArray(list)) {
      return list;
    }
    if (list && typeof list === "object") {
      const nestedLists = [
        list.models,
        list.performers,
        list.results,
        list.items,
      ];
      for (const nested of nestedLists) {
        if (Array.isArray(nested)) {
          return nested;
        }
      }
    }
  }
  return [];
}
function normalizeModels(list) {
  const normalized = list
    .filter(
      (model) =>
        model &&
        typeof model === "object" &&
        getModelUsername(model)
    )
    .map((model) => {
      const username = getModelUsername(model);
      const age = Number(
        model?.persons?.[0]?.age ?? model?.age ?? 0
      );
      return {
        ...model,
        username,
        name: getModelName(model),
        thumbnail: getModelThumbnail(model),
        age: Number.isFinite(age) ? age : 0,
        viewers: Number(
          model?.viewers ??
            model?.viewerCount ??
            model?.viewer_count ??
            model?.numViewers ??
            model?.details?.viewers ??
            0
        ) || 0,
      };
    });
  // Remove duplicate usernames.
  return Array.from(
    new Map(
      normalized.map((model) => [
        model.username.toLowerCase(),
        model,
      ])
    ).values()
  );
}
function ModelCard({ model }) {
  const [imageError, setImageError] = useState(false);
  const username = model.username;
  const thumbnail = model.thumbnail;
  const name = model.name || "Live Model";
  const age = model.age || 0;
  const viewers = model.viewers || 0;
  useEffect(() => {
    setImageError(false);
  }, [thumbnail]);
  function openModel() {
    if (!username) return;
    window.location.href =
      "/live?model=" + encodeURIComponent(username);
  }
  return (
    <article className="stream-card model-card">
      <button
        type="button"
        className="model-card-click"
        onClick={openModel}
        aria-label={`View ${name}`}
        disabled={!username}
      >
        {!imageError && thumbnail ? (
          <img
            className="model-thumbnail"
            src={thumbnail}
            alt={`${name} thumbnail`}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="model-thumbnail model-thumbnail-fallback">
            <Radio size={32} />
          </div>
        )}
        <span className="model-online">
          ● LIVE
        </span>
        <div className="stream-info">
          <h3>{name}</h3>
          <p>
            {age > 0 ? `${age}+ · ` : ""}
            <Eye
              size={14}
              style={{
                display: "inline",
                verticalAlign: "middle",
              }}
            />
            {" "}
            {viewers.toLocaleString()} watching
          </p>
        </div>
      </button>
    </article>
  );
}
export default function Home() {
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  useEffect(() => {
    let active = true;
    async function loadModels() {
      try {
        const response = await fetch(API_URL, {
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `API returned ${response.status}: ${errorText.slice(0, 200)}`
          );
        }
        const data = await response.json();
        const list = extractModels(data);
        const normalized = normalizeModels(list);
        console.log("OnlyStream A.W. API response:", data);
        console.log("Extracted model count:", list.length);
        console.log("Normalized model count:", normalized.length);
        if (!active) return;
        if (normalized.length === 0) {
          setModels([]);
          setModelsError(
            "No models were found in the API response. Check the feed response and field names."
          );
        } else {
          setModels(normalized);
          setModelsError("");
        }
      } catch (error) {
        console.error("OnlyStream model feed error:", error);
        if (active) {
          setModelsError(
            error.message || "Could not load live models."
          );
        }
      } finally {
        if (active) {
          setModelsLoading(false);
        }
      }
    }
    loadModels();
    const interval = setInterval(
      loadModels,
      REFRESH_INTERVAL
    );
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  const sectionSize = Math.ceil(models.length / 5);
  const liveSections = [
    {
      title: "Models Live Now",
      subtitle: "Discover who's online",
      color: "purple",
      models: models.slice(0, sectionSize),
    },
    {
      title: "Trending Now",
      subtitle: "Live models to discover",
      color: "blue",
      models: models.slice(sectionSize, sectionSize * 2),
    },
    {
      title: "Popular Creators",
      subtitle: "More creators to discover",
      color: "pink",
      models: models.slice(sectionSize * 2, sectionSize * 3),
    },
    {
      title: "Just For You",
      subtitle: "Discover more creators",
      color: "green",
      models: models.slice(sectionSize * 3, sectionSize * 4),
    },
    {
      title: "Explore More",
      subtitle: "Keep discovering",
      color: "purple",
      models: models.slice(sectionSize * 4),
    },
  ];
  function startChatting() {
    window.location.href = "/call";
  }
  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <span className="online-status">
          ● We're online
        </span>
      </nav>
      <section className="hero">
        <span className="eyebrow">
          YOUR NEXT CONVERSATION STARTS HERE
        </span>
        <h1>
          Meet someone
          <br />
          <span>unexpected.</span>
        </h1>
        <p>
          Real conversations. New connections. One click away.
        </p>
        <button
          type="button"
          className="start-btn"
          onClick={startChatting}
        >
          <span className="start-icon">
            <Video size={23} />
            <Sparkles
              size={13}
              className="icon-sparkle"
            />
          </span>
          <span>START CHATTING</span>
          <ArrowUpRight size={21} />
        </button>
        <small>
          No complicated setup. Just start chatting.
        </small>
      </section>
      <section className="discovery">
        {liveSections.map((section) => (
          <section
            className="category-section"
            key={section.title}
          >
            <div className="category-heading">
              <div className="category-title-wrap">
                <span
                  className={`category-icon ${section.color}`}
                >
                  <Radio size={19} />
                </span>
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.subtitle}</p>
                </div>
              </div>
              <span className="online-status">
                ● {section.models.length} models
              </span>
            </div>
            {modelsLoading ? (
              <p>Loading live models...</p>
            ) : modelsError && models.length === 0 ? (
              <p className="models-error">
                Couldn't load live models. {modelsError}
              </p>
            ) : section.models.length === 0 ? (
              <p>No more models in this section.</p>
            ) : (
              <div className="category-track">
                {section.models.map((model) => (
                  <ModelCard
                    key={model.username}
                    model={model}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </section>
      <footer>
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}
