import React, { useEffect, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  Gamepad2,
  Music2,
  MessageCircle,
  Radio,
  TrendingUp,
  Heart,
} from "lucide-react";
import "./Home.css";



function ModelCard({ model }) {
  return (
    <article className="stream-card model-card">
      <button
        className="model-card-click"
        onClick={() => {
          window.location.href =
            "/live?model=" + encodeURIComponent(model.username);
        }}
        aria-label={`Watch ${model.name}`}
      >
        <img
          className="model-thumbnail"
          src={model.thumbnail}
          alt=""
          loading="lazy"
        />

        <span className="model-online">● LIVE</span>

        <div className="stream-info">
          <h3>{model.name}</h3>
          <p>
            {model.age ? `${model.age}+ · ` : ""}
            Online now
          </p>
        </div>
      </button>
    </article>
  );
}


function openLive(channel) {
  window.location.href =
    "/live?channel=" + encodeURIComponent(channel);
}

function StreamCard({ stream }) {
  return (
    <article
      className={`stream-card ${stream.color} category-card`}
      key={stream.id}
    >
      <span className="stream-badge">EXPLORE</span>

      <div className="stream-info">
        <h3>{stream.title}</h3>
        <p>{stream.channel}</p>
      </div>

      <button
        className="join-btn"
        onClick={() => openLive(stream.channel)}
      >
        Watch <ArrowUpRight size={15} />
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
        const response = await fetch("/api/models-online");

        if (!response.ok) {
          throw new Error("Could not load models");
        }

        const data = await response.json();

        if (active) {
          setModels(Array.isArray(data.models) ? data.models : []);
          setModelsError(false);
          setModelsLoading(false);
        }
      } catch {
        if (active) {
          setModelsError(true);
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

      {/* Existing hero — kept in place */}
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

      
      {/* Live BongaCams models */}
      <section className="discovery live-models-section">
        <div className="category-heading">
          <div className="category-title-wrap">
            <span className="category-icon purple">
              <Radio size={19} />
            </span>
            <div>
              <h2>Models Live Now</h2>
              <p>Discover who's online</p>
            </div>
          </div>
          <span className="online-status">
            ● {models.length} online
          </span>
        </div>

        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError ? (
          <p>Couldn't load live models. Please try again later.</p>
        ) : models.length === 0 ? (
          <p>No models are available right now.</p>
        ) : (
          <div className="category-track">
            {models.map((model) => (
              <ModelCard key={model.username} model={model} />
            ))}
          </div>
        )}
      </section>

      
<section className="discovery">
  {[
    { title: "Trending Now", subtitle: "Live models to discover", color: "purple" },
    { title: "Popular Creators", subtitle: "More creators online", color: "blue" },
    { title: "Just For You", subtitle: "Discover more live models", color: "pink" },
    { title: "Explore More", subtitle: "Keep discovering", color: "green" },
  ].map((section, index) => {
    const start = models.length ? (index * 3) % models.length : 0;
    const sectionModels = [
      ...models.slice(start),
      ...models.slice(0, start),
    ];

    return (
      <section className="category-section" key={section.title}>
        <div className="category-heading">
          <div className="category-title-wrap">
            <div>
              <h2>{section.title}</h2>
              <p>{section.subtitle}</p>
            </div>
          </div>
          <span className="online-status">● {sectionModels.length} online</span>
        </div>

        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError ? (
          <p>Couldn't load live models.</p>
        ) : sectionModels.length === 0 ? (
          <p>No live models available right now.</p>
        ) : (
          <div className="category-track">
            {sectionModels.map((model) => (
              <ModelCard key={model.username} model={model} />
            ))}
          </div>
        )}
      </section>
    );
  })}
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

