export const setToken = (user) => {
  try {
    if (user == null) {
      localStorage.removeItem("user");
      return;
    }

    const value = typeof user === "string" ? user : JSON.stringify(user);
    localStorage.setItem("user", value);
  } catch (error) {
    console.error("Failed to save user session:", error);
  }
};

export const getToken = () => {
  try {
    const value = localStorage.getItem("user");
    return value ? value : null;
  } catch (error) {
    console.error("Failed to read user session:", error);
    return null;
  }
};

export const getUser = () => {
  try {
    const data = localStorage.getItem("user");
    if (!data) return null;

    const user = JSON.parse(data);

    if (!user || typeof user !== "object") {
      localStorage.removeItem("user");
      return null;
    }

    return user;
  } catch (error) {
    console.warn("Invalid stored user session. Clearing it.");
    localStorage.removeItem("user");
    return null;
  }
};

export const logout = () => {
  try {
    localStorage.removeItem("user");
  } catch (error) {
    console.error("Failed to clear user session:", error);
  }
};
