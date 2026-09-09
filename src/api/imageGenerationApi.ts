import { apiGet, apiPostForm, apiPostJson } from "./client";
import type {
  GenerateImagesParams,
  GenerateImagesResponse,
  ImageModelsResponse,
  RefineImageParams,
  RefineImageResponse,
} from "./types";

const BASE_PATH = "/api/image-generation";

export function getImageModels(signal?: AbortSignal): Promise<ImageModelsResponse> {
  return apiGet<ImageModelsResponse>(`${BASE_PATH}/models`, { signal });
}

function buildGenerateForm(params: GenerateImagesParams): FormData {
  const form = new FormData();
  for (const file of params.images) {
    form.append("images", file);
  }
  form.append("timeOfDay", params.timeOfDay);
  form.append("weather", params.weather);
  form.append("location", params.location);
  form.append("imageCount", String(params.imageCount));
  form.append("aspectRatio", params.aspectRatio);
  if (params.modelKey) {
    form.append("modelKey", params.modelKey);
  }
  if (params.imageSize) {
    form.append("imageSize", params.imageSize);
  }
  return form;
}

export function generateImages(
  params: GenerateImagesParams,
  signal?: AbortSignal,
): Promise<GenerateImagesResponse> {
  return apiPostForm<GenerateImagesResponse>(BASE_PATH, buildGenerateForm(params), { signal });
}

export function refineImage(
  params: RefineImageParams,
  signal?: AbortSignal,
): Promise<RefineImageResponse> {
  return apiPostJson<RefineImageResponse>(`${BASE_PATH}/refine`, params, { signal });
}
