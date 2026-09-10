import type { ApiErrorDetail } from "./apiTypes";

/**
 * Base URL of the Handliz.ai API. Configured via VITE_API_BASE_URL (see .env.development /
 * .env.local) - defaults to the backend's http launch profile port.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5047";

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
