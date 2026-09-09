export interface UserDto {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  success: true;
  accessToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserDto;
}

export interface SignupParams {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface GoogleLoginParams {
  idToken: string;
}
