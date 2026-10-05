import { getApiAuthToken } from "@/apiUtils/authToken";
import { translateApiError } from "@/utils/apiErrors";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = import.meta.env.VITE_EXECUTION_CONFIG === "production" ? getApiAuthToken() : `${import.meta.env.VITE_EXECUTION_DEVELOPMENT_TOKEN}`;
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${import.meta.env.VITE_BACKEND_API_URL}${path}`,
    {
      ...options,
      headers,
    },
  );

  if (!response.ok) {
    throw new Error(translateApiError(await getErrorMessage(response)));
  }

  const text = await response.text();

  return (text ? JSON.parse(text) : undefined) as T;
}

const getErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();

    if (typeof data?.message === "string") return data.message;
    if(typeof data?.error === "string") return data.error;
    if (Array.isArray(data?.message)) return data.message.join(", ");
  } catch {
    return `Request failed with status ${response.status}`;
  }

  return `Request failed with status ${response.status}`;
};
