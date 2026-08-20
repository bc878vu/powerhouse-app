import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { panelRequest } from "./services/firebasePanelStore";

if (typeof window !== "undefined" && !window.__POWERHOUSE_SAFE_FETCH__) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const request = args[0];
    const requestUrl = typeof request === "string" ? request : request?.url || "";
    const requestOptions = args[1] || {};
    const method = String(requestOptions.method || "GET").toUpperCase();
    const isPanelApi = /\/api\/panels(?:\/|$)/.test(requestUrl);

    if (isPanelApi) {
      try {
        let body = undefined;
        if (requestOptions.body) {
          try { body = JSON.parse(requestOptions.body); } catch { body = requestOptions.body; }
        }
        const base = requestUrl.split("/api")[1] || "/panels";
        const data = await panelRequest(method, base, body);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message || "Firebase request failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const response = await nativeFetch(...args);
    const contentType = response.headers.get("content-type") || "";

    if (requestUrl.includes("/api/") && contentType.toLowerCase().includes("text/html")) {
      const html = await response.text();
      return new Response(JSON.stringify({
        success: false,
        message: response.status === 404 ? "API route not found." : `Backend returned an HTML error page (HTTP ${response.status}).`,
        status: response.status,
        details: html.slice(0, 300)
      }), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" }
      });
    }

    return response;
  };

  window.__POWERHOUSE_SAFE_FETCH__ = true;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the app-shell service worker after the first render. It only caches
// static same-origin assets; Firestore/Auth/FCM traffic remains network-first.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/powerhouse-sw.js", { scope: "/" }).catch((error) => {
      console.warn("PowerHouse app cache worker registration failed:", error?.message || error);
    });
  }, { once: true });
}
