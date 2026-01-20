const API_BASE = import.meta.env.VITE_API_URL || "";

let authToken = localStorage.getItem("token") || "";

export const setToken = (token: string) => {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
};

export const getToken = () => authToken;

type ApiOptions = RequestInit & { json?: unknown };

export const apiFetch = async <T>(path: string, options: ApiOptions = {}) => {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined)
  };
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "Erreur réseau";
    throw new Error(message);
  }
  return data as T;
};
