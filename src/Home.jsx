
import React, { useEffect, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  Radio,
  Eye,
} from "lucide-react";
import "./Home.css";

function ModelCard({ model }) {
  const [imageError, setImageError] = useState(false);

  const username =
    model.username || model.nickname || model.name || "";

  const thumbnail =
    model.thumbnail ||
    model.thumb ||
    model.thumb_big ||
    model.profile_thumb_sfw ||
    model.profile_thumb ||
    model.thumb_error;

  const name = model.name || model.nickname || "Live Model";
  const viewers = Number(model.viewers) || 0;
  const age = Number(model.age);

  // Open our own LivePage instead of opening CAM4 directly.
  const openModel = () => {
    if (!username) return;

    window.location.href =
      "/live?model=" + encodeURIComponent(username);
  };

  return (
    <article className="stream-card model-card">
      <button
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

        <span className="model-online">● LIVE</span>

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
            {" "}{viewers.toLocaleString()} watching
          </p>
        </div>
      </button>
    </article>
  );
}

export default function Home() {
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        const response = await fetch("/api/cam4-models");

        if (!response.ok) {
          throw new Error("Could not load CAM4 models");
        }

        const data = await response.json();

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.models)
          ? data.models
          : [];

        const normalized = list
          .filter(
            (model) =>
              model &&
              (model.nickname || model.username || model.name)
          )
          .map((model) => ({
            ...model,
            username:
              model.nickname || model.username || model.name,
            name:
              model.nickname || model.name || model.username,
            thumbnail:
              model.thumb ||
              model.thumb_big ||
              model.profile_thumb_sfw ||
              model.profile_thumb ||
              model.thumb_error,
            viewers: Number(model.viewers) || 0,
            link: model.link || model.profileUrl || "",
          }));

        const unique = Array.from(
          new Map(
            normalized.map((model) => [model.username, model])
          ).values()
        );

        if (active) {
          setModels(unique);
          setModelsError(false);
        }
      } catch (error) {
        console.error("CAM4 models error:", error);

        if (active) {
          setModelsError(true);
        }
      } finally {
        if (active) {
          setModelsLoading(false);
        }
      }
    }

    loadModels();

    const interval = setInterval(loadModels, 45000);

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
      subtitle: "More creators online",
      color: "pink",
      models: models.slice(sectionSize * 2, sectionSize * 3),
    },
    {
      title: "Just For You",
      subtitle: "Discover more live models",
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

  const startChatting = () => {
    window.location.href = "/call";
  };

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

        <button className="start-btn" onClick={startChatting}>
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
        {liveSections.map((section) => (
          <section
            className="category-section"
            key={section.title}
          >
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
                ● {section.models.length} online
              </span>
            </div>

            {modelsLoading ? (
              <p>Loading live models...</p>
            ) : modelsError ? (
              <p>
                Couldn't load live models. Please try again later.
              </p>
            ) : section.models.length === 0 ? (
              <p>No live models available in this section.</p>
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
