import { apiGet, apiPostJson } from "./client";
import type { AuthResponse, GoogleLoginParams, LoginParams, SignupParams, UserDto } from "./authTypes";

const BASE_PATH = "/api/auth";

export function signup(params: SignupParams, signal?: AbortSignal): Promise<AuthResponse> {
  return apiPostJson<AuthResponse>(`${BASE_PATH}/signup`, params, { signal });
}

export function login(params: LoginParams, signal?: AbortSignal): Promise<AuthResponse> {
  return apiPostJson<AuthResponse>(`${BASE_PATH}/login`, params, { signal });
}

export function googleLogin(params: GoogleLoginParams, signal?: AbortSignal): Promise<AuthResponse> {
  return apiPostJson<AuthResponse>(`${BASE_PATH}/google`, params, { signal });
}

/** Rotates the refresh token (read from the httpOnly cookie server-side) for a new access token. */
export function refresh(signal?: AbortSignal): Promise<AuthResponse> {
  return apiPostJson<AuthResponse>(`${BASE_PATH}/refresh`, {}, { signal });
}

export function logout(signal?: AbortSignal): Promise<{ success: true }> {
  return apiPostJson<{ success: true }>(`${BASE_PATH}/logout`, {}, { signal });
}

export function getCurrentUser(accessToken: string, signal?: AbortSignal): Promise<UserDto> {
  return apiGet<UserDto>(`${BASE_PATH}/me`, { accessToken, signal });
}
