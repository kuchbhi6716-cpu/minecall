
import React from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { categories } from "./categories";
import "./Home.css";

export default function CategoryPage() {
  const slug = window.location.pathname.split("/")[2];
  const category = categories.find((item) => item.id === slug);

  if (!category) {
    return (
      <main className="minebbe category-page">
        <a className="logo" href="/">minebbe<span>.</span></a>
        <h1>Category not found</h1>
        <a href="/">Back to home</a>
      </main>
    );
  }

  const Icon = category.icon;

  return (
    <main className="minebbe category-page">
      <nav className="navbar">
        <a className="logo" href="/">minebbe<span>.</span></a>
        <a className="view-more-btn" href="/">
          <ArrowLeft size={17} /> Home
        </a>
      </nav>

      <section className="category-page-heading">
        <span className={`category-icon ${category.color}`}>
          <Icon size={24} />
        </span>
        <p className="eyebrow">DISCOVER SOMETHING NEW</p>
        <h1>{category.title}</h1>
        <p>{category.subtitle}</p>
      </section>

      <section className="category-page-grid">
        {category.cards.map((card) => (
          <article
            className={`stream-card ${card.color} category-card`}
            key={`${category.id}-${card.id}`}
          >
            <span className="stream-badge">
              {card.live ? "CHANNEL" : "EXPLORE"}
            </span>

            <div className="stream-info">
              <h3>{card.title}</h3>
              <p>{card.live ? "Twitch channel" : "Discovery preview"}</p>
            </div>

            {card.live ? (
              <button
                className="join-btn"
                onClick={() => {
                  window.location.href =
                    "/live?channel=" + encodeURIComponent(card.channel);
                }}
              >
                Watch live <ArrowUpRight size={15} />
              </button>
            ) : (
              <span className="coming-soon">Preview · Demo</span>
            )}
          </article>
        ))}
      </section>

      <footer>
        <a className="logo" href="/">minebbe<span>.</span></a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}
