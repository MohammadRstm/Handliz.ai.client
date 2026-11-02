import type { ApiErrorDetail } from "./apiTypes";

/**
 * Base URL of the Handliz.ai API. Configured via VITE_API_BASE_URL (see .env.development /
 * .env.local) - defaults to the backend's http launch profile port.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5047";

/**
 * Resolves an API-relative image URL (as returned in `url` / `thumbnailUrl` fields) against
 * the API origin, for use directly as an `<img src>`.
 *
 * These URLs are signed rather than bearer-authenticated, precisely so the browser can load
 * them natively - it cannot attach an Authorization header to an image request. That in turn
 * is what lets images be cached, lazily loaded, and fetched in parallel, none of which was
 * possible while they were base64 blobs inlined in JSON responses.
 */
export function imageUrl(apiRelativeUrl: string): string {
  return `${API_BASE_URL}${apiRelativeUrl}`;
}

/**
 * The same signed image URL, served as a download named `name` (the API adds the extension).
 * A plain link is enough: the image is cross-origin, where <a download> is ignored, so the
 * API sends it as an attachment instead.
 */
export function imageDownloadUrl(apiRelativeUrl: string, name: string): string {
  return `${imageUrl(apiRelativeUrl)}&download=${encodeURIComponent(name)}`;
}

/** Thrown for every non-2xx response. Carries the same ApiErrorDetail the backend returns. */
export class ApiError extends Error {
  readonly code: string;
  readonly stage?: string | null;
  readonly fieldErrors?: Record<string, string[]> | null;
  readonly status: number;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message);
    this.name = "ApiError";
    this.status = status;
    this.code = detail.code;
    this.stage = detail.stage;
    this.fieldErrors = detail.fieldErrors;
  }
}

async function parseErrorBody(response: Response): Promise<ApiErrorDetail> {
  try {
    const body = await response.json();
    if (body?.error?.code && body?.error?.message) {
      return body.error as ApiErrorDetail;
    }
  } catch {
    // response body wasn't JSON (e.g. a raw network/proxy error page) - fall through
  }
  return {
    code: "UNKNOWN_ERROR",
    message: `Request failed with status ${response.status}.`,
  };
}

/** Shared response handling for every API call: throws ApiError on failure, else parses JSON. */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorBody(response));
  }
  return (await response.json()) as T;
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Attached as `Authorization: Bearer <token>` when present - for endpoints behind [Authorize]. */
  accessToken?: string;
}

// `credentials: "include"` on every call: the refreshToken cookie is httpOnly and
// scoped to /api/auth, so sending it on every request is harmless, and auth endpoints
// need it both to receive Set-Cookie (login/signup/google) and to send it back (refresh/logout).
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal: options.signal,
    credentials: "include",
    headers: authHeader(options.accessToken),
  });
  return handleResponse<T>(response);
}

/** An authorized GET of a file - for downloads that need the bearer token, which a plain link can't send. */
export async function apiGetBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal: options.signal,
    credentials: "include",
    headers: authHeader(options.accessToken),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorBody(response));
  }
  return response.blob();
}

/** Hands a fetched file to the browser's downloads. The blob URL is same-origin, so <a download> names it. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick, once the click has handed the URL to the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function apiPostJson<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader(options.accessToken) },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  return handleResponse<T>(response);
}

export async function apiPatchJson<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader(options.accessToken) },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  return handleResponse<T>(response);
}

export async function apiPutJson<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader(options.accessToken) },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  return handleResponse<T>(response);
}

export async function apiDeleteJson<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader(options.accessToken) },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  return handleResponse<T>(response);
}

export async function apiPostForm<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: authHeader(options.accessToken),
    body: form,
    signal: options.signal,
  });
  return handleResponse<T>(response);
}

function authHeader(accessToken?: string): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
