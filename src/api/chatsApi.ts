import { apiGet, apiPostForm, apiPostJson } from "./client";
import type {
  ChatDetailResponse,
  ChatListResponse,
  GeneratedImageDto,
  ImageModelsResponse,
  RefineImageResponse,
  StartChatParams,
  StartChatResponse,
} from "./chatTypes";

const BASE_PATH = "/api/chats";

export function getImageModels(accessToken: string, signal?: AbortSignal): Promise<ImageModelsResponse> {
  return apiGet<ImageModelsResponse>(`${BASE_PATH}/models`, { accessToken, signal });
}

export function listChats(accessToken: string, signal?: AbortSignal): Promise<ChatListResponse> {
  return apiGet<ChatListResponse>(BASE_PATH, { accessToken, signal });
}

export function getChat(chatId: string, accessToken: string, signal?: AbortSignal): Promise<ChatDetailResponse> {
  return apiGet<ChatDetailResponse>(`${BASE_PATH}/${chatId}`, { accessToken, signal });
}

function buildStartChatForm(params: StartChatParams): FormData {
  const form = new FormData();
  for (const file of params.images) {
    form.append("images", file);
  }
  form.append("timeOfDay", params.timeOfDay);
  form.append("weather", params.weather);
  form.append("location", params.location);
  form.append("imageCount", String(params.imageCount));
  form.append("aspectRatio", params.aspectRatio);
  if (params.modelKey) form.append("modelKey", params.modelKey);
  if (params.imageSize) form.append("imageSize", params.imageSize);
  return form;
}

export function startChat(params: StartChatParams, accessToken: string, signal?: AbortSignal): Promise<StartChatResponse> {
  return apiPostForm<StartChatResponse>(BASE_PATH, buildStartChatForm(params), { accessToken, signal });
}

/** Generates ONE image for a chat slot. Call this once per index in parallel - each resolves independently. */
export function generateChatImage(
  chatId: string,
  index: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<GeneratedImageDto> {
  return apiPostJson<GeneratedImageDto>(`${BASE_PATH}/${chatId}/images/${index}`, {}, { accessToken, signal });
}

export function refineImage(
  imageId: string,
  instruction: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RefineImageResponse> {
  return apiPostJson<RefineImageResponse>(`${BASE_PATH}/images/${imageId}/refine`, { instruction }, { accessToken, signal });
}
