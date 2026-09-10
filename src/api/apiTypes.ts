// Generic API envelope types shared by every endpoint (chats, auth, etc.) - not specific
// to any one feature's DTOs.

export interface ApiErrorDetail {
  code: string;
  message: string;
  stage?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}
