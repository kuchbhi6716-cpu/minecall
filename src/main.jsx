
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthPage from "./AuthPage.jsx";
import "./style.css";
import "./AuthPage.css";

function RootApp() {
  const path = window.location.pathname;

  if (path === "/login" || path === "/signup") {
    return <AuthPage />;
  }

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);

