import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./layout-overrides.css";
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
        if (requestOptions.body) { try { body = JSON.parse(requestOptions.body); } catch { body = requestOptions.body; } }
        const base = requestUrl.split("/api")[1] || "/panels";
        const data = await panelRequest(method, base, body);
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message || "Firebase request failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    const response = await nativeFetch(...args);
    const contentType = response.headers.get("content-type") || "";
    if (requestUrl.includes("/api/") && contentType.toLowerCase().includes("text/html")) {
      const html = await response.text();
      return new Response(JSON.stringify({ success: false, message: response.status === 404 ? "API route not found." : `Backend returned an HTML error page (HTTP ${response.status}).`, status: response.status, details: html.slice(0, 300) }), { status: response.status, statusText: response.statusText, headers: { "Content-Type": "application/json" } });
    }
    return response;
  };
  window.__POWERHOUSE_SAFE_FETCH__ = true;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);

if (typeof window !== "undefined") {
  /* Keep ordinary selects in single-line mode. A stale/accidental size value
     can make Chrome device emulation render the huge white list seen in the screenshot. */
  const normalizeSelect = (select) => {
    if (!(select instanceof HTMLSelectElement) || select.multiple) return;
    if (select.size > 1) select.size = 1;
    select.style.maxWidth = "100%";
    select.style.minWidth = "0";
  };
  const normalizeAllSelects = (root = document) => root.querySelectorAll?.("select:not([multiple])").forEach(normalizeSelect);
  normalizeAllSelects();
  const selectObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLSelectElement) normalizeSelect(record.target);
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.("select:not([multiple])")) normalizeSelect(node);
        normalizeAllSelects(node);
      });
    }
  });
  selectObserver.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["size","multiple"] });

  const observer = new MutationObserver(() => {
    if (window.location.pathname !== "/add-staff") return;
    const nodes = document.querySelectorAll("div, section");
    for (const node of nodes) {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (text.includes("Automatic Employee ID") && text.includes("AUTO GENERATED") && text.length < 500) {
        const target = node.closest("section") || node;
        target.style.display = "none";
        observer.disconnect();
        return;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", () => { normalizeAllSelects(); observer.takeRecords(); }, { once: true });
  setTimeout(() => { normalizeAllSelects(); observer.takeRecords(); }, 0);
}

// v17 forces installed PWAs to replace any stale notification worker.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/powerhouse-sw.js?v=17", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update().catch(() => {}))
      .catch((error) => console.warn("PowerHouse app cache worker registration failed:", error?.message || error));
  }, { once: true });
}
