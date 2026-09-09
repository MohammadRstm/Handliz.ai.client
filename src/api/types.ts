// Mirrors the backend DTOs (Handliz.ai/Dtos/**). System.Text.Json's Web defaults
// camelCase every property name, so these fields match exactly what the API returns.

export type TimeOfDay =
  | "Dawn"
  | "Morning"
  | "Midday"
  | "Afternoon"
  | "GoldenHour"
  | "Sunset"
  | "Dusk"
  | "Night";

export type WeatherCondition =
  | "Clear"
  | "PartlyCloudy"
  | "Overcast"
  | "Rain"
  | "Storm"
  | "Snow"
  | "Fog"
  | "Windy";

export interface ImageModelDto {
  key: string;
  displayName: string;
  description: string;
  supportedImageSizes: string[];
  defaultImageSize: string;
  maxReferenceImages: number;
}

export interface ImageModelsResponse {
  success: true;
  defaultModelKey: string;
  models: ImageModelDto[];
  supportedAspectRatios: string[];
  maxGeneratedImages: number;
}

export interface ImageModelSummaryDto {
  key: string;
  displayName: string;
}

export interface GeneratedImageDto {
  imageId: string;
  index: number;
  mimeType: string;
  dataUrl: string;
}

export interface GenerationTimingsDto {
  promptMs: number;
  imagesMs: number;
}

export interface GenerateImagesResponse {
  success: true;
  requestedCount: number;
  images: GeneratedImageDto[];
  failedCount: number;
  warnings: string[];
  generatedPrompt?: string | null;
  model: ImageModelSummaryDto;
  imageSize: string;
  timings: GenerationTimingsDto;
}

export interface ChatMessageDto {
  role: "user" | "assistant";
  text: string;
  createdAtUtc: string;
}

export interface RefineImageResponse {
  success: true;
  imageId: string;
  mimeType: string;
  dataUrl: string;
  model: ImageModelSummaryDto;
  history: ChatMessageDto[];
  historyTruncated: boolean;
  refineMs: number;
}

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

export interface GenerateImagesParams {
  images: File[];
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
  imageCount: number;
  aspectRatio: string;
  modelKey?: string;
  imageSize?: string;
}

export interface RefineImageParams {
  imageId: string;
  instruction: string;
}
