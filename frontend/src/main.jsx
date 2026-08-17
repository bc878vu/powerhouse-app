import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Convert HTML error pages returned by an API/proxy into JSON errors.
// This prevents pages such as AddPanel from crashing with
// "Unexpected token '<'" when a backend route is missing.
if (typeof window !== "undefined" && !window.__POWERHOUSE_SAFE_FETCH__) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const request = args[0];
    const requestUrl =
      typeof request === "string"
        ? request
        : request?.url || "";
    const contentType = response.headers.get("content-type") || "";

    if (
      requestUrl.includes("/api/") &&
      contentType.toLowerCase().includes("text/html")
    ) {
      const html = await response.text();

      return new Response(
        JSON.stringify({
          success: false,
          message:
            response.status === 404
              ? "API route not found. The backend deployment is outdated or the endpoint is unavailable."
              : `Backend returned an HTML error page (HTTP ${response.status}).`,
          status: response.status,
          details: html.slice(0, 300)
        }),
        {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
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
