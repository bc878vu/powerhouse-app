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

// Hide the legacy employee-ID banner on the Add Staff page. The ID is still
// generated and stored by the backend; it simply does not take UI space.
if (typeof window !== "undefined") {
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
  window.addEventListener("load", () => observer.takeRecords(), { once: true });
  setTimeout(() => observer.takeRecords(), 0);
}

// Optional-media task compatibility + Staff Records presentation polish.
// This is intentionally a UI compatibility layer so the existing task API,
// assignment history and real attachments remain unchanged.
if (typeof window !== "undefined") {
  const OPTIONAL_MEDIA_FILE = "__POWERHOUSE_NO_MEDIA__.txt";

  // The task form previously blocked submit/edit when no attachment existed.
  // On an attachment-free submit we add an internal zero-byte placeholder,
  // let React process the input change, and immediately resubmit. FormData
  // below ignores this placeholder, so the backend receives no media file.
  if (!window.__POWERHOUSE_OPTIONAL_MEDIA_PATCH__) {
    const nativeAppend = FormData.prototype.append;

    FormData.prototype.append = function (name, value, filename) {
      if (
        name === "files" &&
        value instanceof File &&
        value.name === OPTIONAL_MEDIA_FILE
      ) {
        return;
      }

      return nativeAppend.call(this, name, value, filename);
    };

    window.__POWERHOUSE_OPTIONAL_MEDIA_PATCH__ = true;
  }

  const taskObserver = new MutationObserver(() => {
    if (window.location.pathname !== "/assign-tasks") return;

    const form = document.querySelector("form");
    const fileInput = document.querySelector('input[type="file"]');

    if (!form || !fileInput || form.dataset.optionalMediaReady === "1") {
      return;
    }

    form.dataset.optionalMediaReady = "1";

    // Make the page clearer without changing the existing task controls.
    document.title = "Assign Task | PowerHouse";

    form.addEventListener("submit", (event) => {
      if (fileInput.files && fileInput.files.length > 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([""], OPTIONAL_MEDIA_FILE, {
            type: "text/plain",
            lastModified: Date.now()
          })
        );

        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));

        window.setTimeout(() => {
          try {
            form.requestSubmit();
          } catch (retryError) {
            console.warn("Optional-media task retry failed:", retryError);
          }
        }, 120);
      } catch (error) {
        console.warn("Optional-media compatibility failed:", error);
        // Do not prevent the normal submit if the browser cannot create a
        // DataTransfer/File object.
        form.dataset.optionalMediaReady = "0";
      }
    }, true);
  });

  taskObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Staff Records: show a clean sequential row number instead of exposing
  // raw database/Firebase IDs in the table. The real ID remains available in
  // View Details/edit actions and is never changed in the database.
  const staffObserver = new MutationObserver(() => {
    if (window.location.pathname !== "/staff-records") return;

    const tables = Array.from(document.querySelectorAll("table"));

    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll("thead th"));
      if (!headerCells.length) continue;

      const idHeader = headerCells.find((cell) =>
        /^\s*ID\s*$/i.test(cell.textContent || "")
      );

      if (idHeader) {
        idHeader.textContent = "No.";
        idHeader.classList.add("text-center");
      }

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      rows.forEach((row, index) => {
        const firstCell = row.querySelector("td");
        if (!firstCell) return;

        const number = String(index + 1).padStart(2, "0");
        firstCell.textContent = number;
        firstCell.classList.add("text-center", "font-black", "text-yellow-400");
        firstCell.title = `Staff record ${index + 1}`;
      });
    }
  });

  staffObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("load", () => {
    taskObserver.takeRecords();
    staffObserver.takeRecords();
  }, { once: true });
}

// Register the app-shell service worker after the first render. It only caches
// static same-origin assets; Firestore/Auth/FCM traffic remains network-first.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/powerhouse-sw.js", { scope: "/" }).catch((error) => {
      console.warn("PowerHouse app cache worker registration failed:", error?.message || error);
    });
  }, { once: true });
}
