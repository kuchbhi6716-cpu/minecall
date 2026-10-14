
import React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Play,
  Radio,
  Users,
} from "lucide-react";
import { categories } from "./categories";
import "./Home.css";

export default function CategoryPage() {
  const slug = window.location.pathname.split("/")[2];

  const category = categories.find(
    (item) => item.id === slug
  );

  if (!category) {
    return (
      <main className="minebbe category-page">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <h1>Category not found</h1>
        <a href="/">Back to home</a>
      </main>
    );
  }

  const Icon = category.icon;

  return (
    <main className="minebbe category-page">
      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>

        <a className="view-more-btn" href="/">
          <ArrowLeft size={17} />
          Home
        </a>
      </nav>

      <section className="stream-page-heading">
        <div className={`category-icon ${category.color}`}>
          <Icon size={24} />
        </div>

        <div>
          <p className="eyebrow">OnlyStream DISCOVERY</p>
          <h1>{category.title}</h1>
          <p>{category.subtitle}</p>
        </div>
      </section>

      <div className="stream-page-toolbar">
        <span>
          <Radio size={16} />
          Explore channels
        </span>
        <span className="stream-total">
          {category.cards.length} listings
        </span>
      </div>

      <section className="vertical-stream-list">
        {category.cards.map((card, index) => (
          <article
            className="vertical-stream-card"
            key={`${category.id}-${card.id}`}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div className={`stream-thumbnail ${card.color}`}>
              <div className="thumbnail-glow" />

              {card.live ? (
                <span className="thumbnail-live">
                  <span /> CHANNEL
                </span>
              ) : (
                <span className="thumbnail-live demo-label">
                  DISCOVER
                </span>
              )}

              <div className="thumbnail-play">
                <Play size={23} fill="currentColor" />
              </div>

              <span className="thumbnail-number">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>

            <div className="vertical-stream-info">
              <span className="stream-category-label">
                {category.title}
              </span>

              <h2>{card.title}</h2>

              <p className="stream-channel-name">
                {card.channel}
              </p>

              <p className="stream-description">
                {card.live
                  ? "Open this creator's channel and check their live broadcast."
                  : "Discovery listing. A verified stream source can be connected here."}
              </p>

              <div className="stream-meta">
                <span>
                  <Users size={14} />
                  Channel listing
                </span>
                <span className="stream-dot">•</span>
                <span>{card.live ? "External stream" : "Preview"}</span>
              </div>
            </div>

            <div className="vertical-stream-action">
  <button
    className="vertical-watch-btn"
    onClick={() => {
      window.location.href =
        "/live?channel=" +
        encodeURIComponent(card.channel);
    }}
  >
    {card.live ? "Watch live" : "View"}
    <ArrowUpRight size={17} />
  </button>
</div>
          </article>
        ))}
      </section>

      <footer>
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <p> Connect safely.</p>
      </footer>
    </main>
  );
}
