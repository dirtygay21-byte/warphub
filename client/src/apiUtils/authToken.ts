const AUTH_TOKEN_STORAGE_KEY = "authToken";

let authToken: string | null =
  typeof window !== "undefined"
    ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    : null;

export const getApiAuthToken = () =>
  authToken ??
  (typeof window !== "undefined"
    ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    : null);

export const setApiAuthToken = (token: string | null) => {
  authToken = token;

  if (typeof window === "undefined") return;

  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
};
