import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Radio, Tv } from "lucide-react";
import "./LivePage.css";
useEffect(() => {
  if (loading || error || !model) return;
  const oldScript = document.getElementById("bongacams-widget-script");
  if (oldScript) oldScript.remove();
  const script = document.createElement("script");
  script.id = "bongacams-widget-script";
  script.type = "text/javascript";
  script.src =
    "https://bngprm.com/promo.php?c=844239&type=embed_chat&model_offline=homepage";
  script.async = true;
  document.getElementById("BC_EC")?.appendChild(script);
  return () => script.remove();
}, [loading, error, model]);

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("model");
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    async function loadModel() {
      try {
        const response = await fetch("/api/models-online");
        if (!response.ok) {
          throw new Error("Could not load live models.");
        }
        const data = await response.json();
        const selected = (data.models || []).find(
          (item) => item.username === username
        );
        if (!selected) {
          throw new Error("This model is not available right now.");
        }
        setModel(selected);
      } catch (err) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    if (username) {
      loadModel();
    } else {
      setError("No model selected. Please return home.");
      setLoading(false);
    }
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
          <h1>Watch <span>live.</span></h1>
          <p>Catch the moment as it happens.</p>
        </div>
        <article className="live-player-card">
        <div className="live-player">
  {loading ? (
    <p>Loading model...</p>
  ) : error ? (
    <p>{error}</p>
  ) : (
    <div
      id="BC_EC"
      style={{
        width: "100%",
        minHeight: "500px",
        background: "#111",
      }}
    >
      <p style={{ color: "white", padding: "20px" }}>
        Loading BongaCams live chat...
      </p>
    </div>
  )}
</div>
          {model && (
            <div className="live-details">
              <div className="live-avatar">
                {model.name.charAt(0).toUpperCase()}
              </div>
              <div className="live-channel-info">
                <h2>{model.name}</h2>
                <p>
                  {model.age ? `Age ${model.age}` : "Live model"}
                </p>
                <span className="live-note">
                  Stream availability depends on the model being online.
                </span>
              </div>
              {model.profileUrl && (
                <a
                  className="live-open-twitch"
                  href={model.profileUrl}
                  target="_blank"
                  rel="noreferrer"
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
