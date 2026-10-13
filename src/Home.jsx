
import React from "react";
import "./Home.css";

const streams = [
  { id: 1, title: "Live Room 01", color: "purple" },
  { id: 2, title: "Live Room 02", color: "blue" },
  { id: 3, title: "Live Room 03", color: "pink" },
  { id: 4, title: "Live Room 04", color: "orange" },
  { id: 5, title: "Live Room 05", color: "green" },
];

export default function Home() {
  const startChatting = () => {
    window.location.href = "/call";
  };

  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">minebbe<span>.</span></a>
        <span className="online-status">● We're online</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</span>
        <h1>Meet someone<br /> <span>unexpected.</span></h1>
        <p>Real conversations. New connections. One click away.</p>

        
<button className="start-btn" onClick={startChatting}>
  <span className="start-icon">
    <Video size={23} />
    <Sparkles size={13} className="icon-sparkle" />
  </span>
  <span>START CHATTING</span>
  <ArrowUpRight size={21} />
</button>


        <small>No complicated setup. Just start chatting.</small>
      </section>

      <section className="streams">
        <div className="section-heading">
          <div>
            <h2>Explore live</h2>
            <p>Discover what's happening</p>
          </div>
          <span className="live-label">● LIVE PREVIEWS</span>
        </div>

        <div className="stream-grid">
          {streams.map((stream) => (
            <article
              className={`stream-card ${stream.color}`}
              key={stream.id}
            >
              <span className="stream-badge">DEMO</span>
              <div className="stream-info">
                <h3>{stream.title}</h3>
                <p>Preview room</p>
              </div>
              
<button
  className="join-btn"
  onClick={() => {
    window.location.href = "/call?room=" + stream.id;
  }}
>
  View room <ArrowUpRight size={15} />
</button>

            </article>
          ))}
        </div>
      </section>

      <footer>
        <a className="logo" href="/">minebbe<span>.</span></a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}
