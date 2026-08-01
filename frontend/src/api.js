import axios from "axios";
import { getUser } from "./utils/auth";

// ============================================================
// ENVIRONMENT
// ============================================================

const isDevelopment = import.meta.env.DEV;

// ============================================================
// BASE URL
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL;

if (isDevelopment) {
  console.log("🔥 API URL:", BASE_URL);
}

if (!BASE_URL) {
  console.error(
    "❌ VITE_API_URL is missing. Please check your frontend .env file."
  );
}

// ============================================================
// AXIOS INSTANCE
//
// IMPORTANT:
//
// Do NOT globally force:
// Content-Type: application/json
//
// Axios automatically handles:
//
// Normal object:
// application/json
//
// FormData:
// multipart/form-data; boundary=...
//
// The multipart boundary must be generated automatically by
// the browser.
// ============================================================

const API = axios.create({
  baseURL: BASE_URL,

  withCredentials: true,

  // 2 minutes - useful for large image/video/audio uploads
  timeout: 120000,

  headers: {
    Accept: "application/json",
  },
});

// ============================================================
// HELPER: CHECK FORMDATA SAFELY
// ============================================================

const isFormDataRequest = (data) => {
  return (
    typeof FormData !== "undefined" &&
    data instanceof FormData
  );
};

// ============================================================
// HELPER: DEBUG FORMDATA
// ============================================================

const debugFormData = (formData) => {
  if (!isDevelopment) return;

  try {
    for (const [key, value] of formData.entries()) {
      // ------------------------------------------------------
      // FILE
      // ------------------------------------------------------

      if (
        typeof File !== "undefined" &&
        value instanceof File
      ) {
        console.log("📎 FORM DATA FILE:", {
          field: key,
          name: value.name,
          type: value.type,
          size: value.size,
          lastModified: value.lastModified,
        });

        continue;
      }

      // ------------------------------------------------------
      // BLOB
      // ------------------------------------------------------

      if (
        typeof Blob !== "undefined" &&
        value instanceof Blob
      ) {
        console.log("📎 FORM DATA BLOB:", {
          field: key,
          type: value.type,
          size: value.size,
        });

        continue;
      }

      // ------------------------------------------------------
      // NORMAL FIELD
      // ------------------------------------------------------

      console.log(
        `📝 FORM DATA FIELD [${key}]:`,
        value
      );
    }
  } catch (error) {
    console.warn(
      "⚠️ Could not inspect FormData:",
      error
    );
  }
};

// ============================================================
// REQUEST INTERCEPTOR
// ============================================================

API.interceptors.request.use(
  (config) => {
    // ========================================================
    // CURRENT LOGGED-IN USER
    // ========================================================

    const user = getUser();

    // Always make sure headers object exists
    config.headers = config.headers || {};

    // ========================================================
    // ADD USER ROLE HEADER
    // ========================================================

    if (user?.role) {
      config.headers.role = user.role;
    }

    // ========================================================
    // ADD USER ID HEADER
    //
    // This is useful for backend logging/auditing if required.
    // The backend should still validate permissions securely.
    // Never trust this header alone for authorization.
    // ========================================================

    if (user?.id) {
      config.headers["x-user-id"] = String(user.id);
    }

    // ========================================================
    // FORM DATA REQUEST
    // ========================================================

    if (isFormDataRequest(config.data)) {
      if (isDevelopment) {
        console.log(
          "📦 FORM DATA REQUEST DETECTED"
        );

        console.log("📦 REQUEST:", {
          method: String(
            config.method || "GET"
          ).toUpperCase(),

          url: config.url,

          baseURL: config.baseURL,

          fullURL: `${config.baseURL || ""}${
            config.url || ""
          }`,
        });
      }

      // ------------------------------------------------------
      // CRITICAL MULTIPART FIX
      //
      // Delete any manually forced Content-Type.
      //
      // Browser/Axios will automatically generate:
      //
      // multipart/form-data;
      // boundary=----WebKitFormBoundary...
      // ------------------------------------------------------

      delete config.headers["Content-Type"];
      delete config.headers["content-type"];

      // Debug fields only during development
      debugFormData(config.data);
    }

    // ========================================================
    // NORMAL JSON / GET / PUT / DELETE REQUEST
    // ========================================================

    else if (isDevelopment) {
      console.log("📄 NORMAL API REQUEST:", {
        method: String(
          config.method || "GET"
        ).toUpperCase(),

        url: config.url,

        baseURL: config.baseURL,

        fullURL: `${config.baseURL || ""}${
          config.url || ""
        }`,
      });
    }

    return config;
  },

  (error) => {
    console.error(
      "❌ REQUEST INTERCEPTOR ERROR:",
      error
    );

    return Promise.reject(error);
  }
);

// ============================================================
// RESPONSE INTERCEPTOR
// ============================================================

API.interceptors.response.use(
  // ==========================================================
  // SUCCESS RESPONSE
  // ==========================================================

  (response) => {
    if (isDevelopment) {
      console.log("✅ API RESPONSE:", {
        method: String(
          response?.config?.method || "GET"
        ).toUpperCase(),

        url: response?.config?.url,

        status: response?.status,
      });
    }

    return response;
  },

  // ==========================================================
  // ERROR RESPONSE
  // ==========================================================

  (error) => {
    const status = error?.response?.status;

    const responseData = error?.response?.data;

    const errorMessage =
      responseData?.message ||
      responseData?.msg ||
      responseData?.error ||
      error?.message ||
      "Unknown API error";

    // ========================================================
    // GENERAL ERROR
    // ========================================================

    console.error("🚀 API ERROR:", {
      message: errorMessage,

      status: status || "NO_RESPONSE",

      method: String(
        error?.config?.method || "UNKNOWN"
      ).toUpperCase(),

      url: error?.config?.url,

      baseURL: error?.config?.baseURL,
    });

    // ========================================================
    // NO BACKEND RESPONSE
    // ========================================================

    if (!error.response) {
      console.error(
        "❌ Backend not reachable. Check:"
      );

      console.error(
        "1. Is the Node.js backend running?"
      );

      console.error(
        "2. Is VITE_API_URL correct?"
      );

      console.error(
        "3. Is the backend port correct?"
      );

      console.error(
        "4. Is CORS configured correctly?"
      );

      console.error(
        "5. Did the request timeout?"
      );

      return Promise.reject(error);
    }

    // ========================================================
    // STATUS-SPECIFIC ERROR LOGGING
    // ========================================================

    switch (status) {
      case 400:
        console.error(
          "❌ 400 BAD REQUEST:",
          responseData
        );
        break;

      case 401:
        console.error(
          "❌ 401 UNAUTHORIZED:",
          responseData
        );
        break;

      case 403:
        console.error(
          "❌ 403 FORBIDDEN:",
          responseData
        );
        break;

      case 404:
        console.error(
          "❌ 404 API ROUTE NOT FOUND:",
          {
            requestedURL: `${
              error?.config?.baseURL || ""
            }${error?.config?.url || ""}`,

            response: responseData,
          }
        );
        break;

      case 409:
        console.error(
          "❌ 409 CONFLICT:",
          responseData
        );
        break;

      case 413:
        console.error(
          "❌ 413 FILE TOO LARGE:",
          responseData
        );
        break;

      case 422:
        console.error(
          "❌ 422 VALIDATION ERROR:",
          responseData
        );
        break;

      case 500:
        console.error(
          "❌ 500 BACKEND SERVER ERROR:",
          responseData
        );
        break;

      default:
        console.error(
          `❌ HTTP ERROR ${status}:`,
          responseData
        );
        break;
    }

    return Promise.reject(error);
  }
);

// ============================================================
// EXPORT
// ============================================================

export default API;