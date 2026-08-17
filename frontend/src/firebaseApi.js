import { requestFirebase } from "./services/firebaseDataStore";
import { listPanels, subscribeToPanels } from "./services/firebasePanelStore";

const FirebaseAPI = {
  get: (url, config = {}) => requestFirebase("GET", url, undefined, config?.params || {}),
  post: (url, data, config = {}) => requestFirebase("POST", url, data, config?.params || {}),
  put: (url, data, config = {}) => requestFirebase("PUT", url, data, config?.params || {}),
  patch: (url, data, config = {}) => requestFirebase("PATCH", url, data, config?.params || {}),
  delete: (url, config = {}) => requestFirebase("DELETE", url, undefined, config?.params || {}),
  subscribeToPanels
};

export { listPanels };
export default FirebaseAPI;
