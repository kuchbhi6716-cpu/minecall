
import React, { useEffect, useRef, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  Radio,
  ChevronDown,
} from "lucide-react";
import "./Home.css";

const API_URL = "/api/aw-models";
const REFRESH_INTERVAL = 45000;
const MISSING_REFRESH_LIMIT = 2;

function normalizeImageUrl(url) {
  if (typeof url !== "string") return "";
  const value = url.trim();
  return value.startsWith("//") ? `https:${value}` : value;
}

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

  const image = images.find(
    (value) => typeof value === "string" && value.trim()
  );

  return image ? normalizeImageUrl(image) : "";
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

  for (const list of candidates) {
    if (Array.isArray(list)) return list;

    if (list && typeof list === "object") {
      for (const key of ["models", "performers", "results", "items"]) {
        if (Array.isArray(list[key])) return list[key];
      }
    }
  }

  return [];
}

function isExplicitlyOffline(model) {
  const status = String(
    model?.status ??
      model?.availability ??
      model?.streamStatus ??
      model?.stream_status ??
      ""
  ).toLowerCase();

  if (
    model?.isOnline === false ||
    model?.is_online === false ||
    model?.online === false ||
    model?.isLive === false ||
    model?.is_live === false
  ) {
    return true;
  }

  return [
    "offline",
    "away",
    "disconnected",
    "not_live",
    "not-live",
  ].includes(status);
}

function normalizeModels(list) {
  const normalized = list
    .filter(
      (model) =>
        model &&
        typeof model === "object" &&
        getModelUsername(model) &&
        !isExplicitlyOffline(model)
    )
    .map((model) => {
      const rawAge = Number(
        model?.persons?.[0]?.age ?? model?.age ?? 0
      );

      return {
        ...model,
        username: getModelUsername(model),
        name: getModelName(model),
        thumbnail: getModelThumbnail(model),
        age:
          Number.isFinite(rawAge) && rawAge > 0
            ? rawAge
            : 0,
      };
    });

  return Array.from(
    new Map(
      normalized.map((model) => [
        model.username.toLowerCase(),
        model,
      ])
    ).values()
  );
}

/*
 * Merge strategy:
 * 1. Existing cards keep their order.
 * 2. Existing creators stay if missing from one refresh.
 * 3. Remove a missing creator after two consecutive successful
 *    API responses without that creator.
 * 4. Append newly discovered creators at the end.
 *
 * Failed API requests never count as evidence that a creator
 * has gone offline.
 */
function mergeModels(previous, incoming, missingCounts) {
  const incomingMap = new Map(
    incoming.map((model) => [
      model.username.toLowerCase(),
      model,
    ])
  );

  const previousKeys = new Set(
    previous.map((model) => model.username.toLowerCase())
  );

  const next = [];

  for (const oldModel of previous) {
    const key = oldModel.username.toLowerCase();
    const freshModel = incomingMap.get(key);

    if (freshModel) {
      missingCounts.delete(key);

      // Update details while preserving the creator's card position.
      next.push({
        ...oldModel,
        ...freshModel,
        username: oldModel.username,
      });
    } else {
      const misses = (missingCounts.get(key) || 0) + 1;
      missingCounts.set(key, misses);

      if (misses < MISSING_REFRESH_LIMIT) {
        next.push(oldModel);
      } else {
        missingCounts.delete(key);
      }
    }
  }

  // New creators appear at the end instead of reshuffling existing cards.
  for (const model of incoming) {
    const key = model.username.toLowerCase();

    if (!previousKeys.has(key)) {
      next.push(model);
      missingCounts.delete(key);
    }
  }

  return next;
}

function ModelCard({ model }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [model.thumbnail]);

  function openModel() {
    window.location.href =
      "/live?model=" + encodeURIComponent(model.username);
  }

  return (
    <article className="stream-card model-card">
      <button
        type="button"
        className="model-card-click"
        onClick={openModel}
        aria-label={`View ${model.name}`}
      >
        {!imageError && model.thumbnail ? (
          <img
            className="model-thumbnail"
            src={model.thumbnail}
            alt={`${model.name} thumbnail`}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="model-thumbnail model-thumbnail-fallback">
            <Radio size={32} />
          </div>
        )}

        <span className="model-online">● LIVE</span>

        <div className="stream-info">
          <h3>{model.name}</h3>
          <p>
            {model.age > 0 ? `${model.age}+ · ` : ""}
            LIVE NOW
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
  const [showMoreSections, setShowMoreSections] = useState(false);

  const missingCountsRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    async function loadModels() {
      if (requestInProgress) return;

      requestInProgress = true;

      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const normalized = normalizeModels(extractModels(data));

        if (!active) return;

        setModels((previous) =>
          mergeModels(
            previous,
            normalized,
            missingCountsRef.current
          )
        );

        setModelsError(
          normalized.length
            ? ""
            : "No models found in the API response."
        );
      } catch (error) {
        if (active) {
          // Keep the current cards if the request fails.
          setModelsError(
            error.message || "Could not refresh live models."
          );
        }
      } finally {
        requestInProgress = false;

        if (active) {
          setModelsLoading(false);
        }
      }
    }

    loadModels();

    const interval = window.setInterval(
      loadModels,
      REFRESH_INTERVAL
    );

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const sectionSize = Math.ceil(models.length / 9);

  const sectionTitles = [
    {
      title: "Models Live Now",
      subtitle: "Discover who's online",
      color: "purple",
    },
    {
      title: "Trending Now",
      subtitle: "Live models to discover",
      color: "blue",
    },
    {
      title: "Popular Creators",
      subtitle: "More creators to discover",
      color: "pink",
    },
    {
      title: "Just For You",
      subtitle: "Discover more creators",
      color: "green",
    },
    {
      title: "Explore More",
      subtitle: "Keep discovering",
      color: "purple",
    },
    {
      title: "Recently Active",
      subtitle: "Discover more live creators",
      color: "blue",
    },
    {
      title: "Featured Creators",
      subtitle: "Find your next conversation",
      color: "pink",
    },
    {
      title: "More To Explore",
      subtitle: "Browse more live profiles",
      color: "green",
    },
    {
      title: "Around The Community",
      subtitle: "See who's available",
      color: "purple",
    },
  ];

  const liveSections = sectionTitles.map((section, index) => ({
    ...section,
    models: models.slice(
      index * sectionSize,
      index === sectionTitles.length - 1
        ? undefined
        : (index + 1) * sectionSize
    ),
  }));

  function startChatting() {
    window.location.href = "/call";
  }

  function renderLiveSection(section) {
    return (
      <section className="category-section" key={section.title}>
        <div className="category-heading">
          <div className="category-title-wrap">
            <span className={`category-icon ${section.color}`}>
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

        {section.models.length === 0 ? (
          <p>No more models in this section.</p>
        ) : (
          <div className="category-track">
            {section.models.map((model) => (
              <ModelCard
                key={model.username.toLowerCase()}
                model={model}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>

        <span className="online-status">● We're online</span>
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
            <Sparkles size={13} className="icon-sparkle" />
          </span>

          <span>START CHATTING</span>
          <ArrowUpRight size={21} />
        </button>

        <small>
          No complicated setup. Just start chatting.
        </small>
      </section>

      <section className="discovery">
        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError && models.length === 0 ? (
          <div className="models-error">
            <p>Couldn't load live models. {modelsError}</p>
          </div>
        ) : models.length === 0 ? (
          <p>No models available right now.</p>
        ) : (
          <>
            {liveSections.slice(0, 2).map(renderLiveSection)}

            <div
              className={`extra-sections ${
                showMoreSections ? "expanded" : ""
              }`}
              aria-hidden={!showMoreSections}
              inert={!showMoreSections}
            >
              <div className="extra-sections-inner">
                {liveSections.slice(2).map(renderLiveSection)}
              </div>
            </div>

            <button
              type="button"
              className="view-more-btn"
              onClick={() =>
                setShowMoreSections((value) => !value)
              }
              aria-expanded={showMoreSections}
            >
              <span>
                {showMoreSections ? "View Less" : "View More"}
              </span>

              <ChevronDown
                size={19}
                className={`view-more-arrow ${
                  showMoreSections ? "arrow-up" : ""
                }`}
              />
            </button>
          </>
        )}
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
