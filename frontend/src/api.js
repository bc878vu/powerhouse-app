import { requestFirebase } from "./services/firebaseDataStore";

// Firebase-only API adapter.
// Preserve the existing axios-like { data } contract used throughout the UI.
const withTimeout = async (promise, ms, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const requestFirebaseApi = (method, url, data, config = {}) =>
  withTimeout(
    requestFirebase(method, url, data, config?.params || {}),
    config?.timeout || 20000,
    `Firebase request timed out: ${method} ${url}`
  );

const request = async (method, url, data, config = {}) => {
  try {
    const result = await requestFirebaseApi(method, url, data, config);
    return { data: result, status: 200, headers: {} };
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.msg ||
      error?.message ||
      `Firebase request failed: ${method} ${url}`;

    error.message = message;
    error.response = {
      status: error?.response?.status || 500,
      data: { success: false, message, msg: message },
    };
    throw error;
  }
};

const API = {
  get: (url, config = {}) => request("GET", url, undefined, config),
  post: (url, data, config = {}) => request("POST", url, data, config),
  put: (url, data, config = {}) => request("PUT", url, data, config),
  patch: (url, data, config = {}) => request("PATCH", url, data, config),
  delete: (url, config = {}) => request("DELETE", url, undefined, config),
};

export default API;
