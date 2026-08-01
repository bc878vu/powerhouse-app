export const setToken = (user) => {
  localStorage.setItem("user", user);
};

export const getToken = () => {
  return localStorage.getItem("user");
};

export const getUser = () => {
  const data = localStorage.getItem("user");
  return data ? JSON.parse(data) : null;
};

export const logout = () => {
  localStorage.removeItem("user");
};