import { panelRequest, listPanels, subscribeToPanels } from "./services/firebasePanelStore";

const isPanelUrl = (url = "") => {
  const value = String(url).replace(/^\/api/, "");
  return value === "/panels" || value.startsWith("/panels/");
};

const request = async (method, url, data) => {
  if (!isPanelUrl(url)) {
    throw new Error(`Firebase migration: endpoint ${method} ${url} has not been migrated yet.`);
  }

  const result = await panelRequest(method, url, data);
  return { data: result, status: 200, config: { method, url } };
};

const FirebaseAPI = {
  get: (url, config) => request("GET", url, config?.params),
  post: (url, data) => request("POST", url, data),
  put: (url, data) => request("PUT", url, data),
  patch: (url, data) => request("PATCH", url, data),
  delete: (url) => request("DELETE", url),
  subscribeToPanels
};

export { listPanels };
export default FirebaseAPI;
