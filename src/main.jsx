
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthPage from "./AuthPage.jsx";
import CreatorDashboard from "./CreatorDashboard.jsx";

import "./style.css";
import "./AuthPage.css";
import "./CreatorDashboard.css";

function RootApp() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/login") {
    return <AuthPage />;
  }

  if (path === "/signup") {
    return <AuthPage initialMode="signup" />;
  }

  if (path === "/creator") {
    return <CreatorDashboard />;
  }

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
