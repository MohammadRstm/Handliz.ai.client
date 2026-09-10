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

export interface ChatSummaryDto {
  id: string;
  location: string;
  lastUsedAtUtc: string;
  requestedImageCount: number;
  thumbnailDataUrl: string | null;
}

export interface ChatListResponse {
  success: true;
  chats: ChatSummaryDto[];
}

export interface UploadedReferenceImageDto {
  index: number;
  mimeType: string;
  dataUrl: string;
}

export interface GeneratedImageDto {
  imageId: string;
  index: number;
  mimeType: string;
  dataUrl: string;
}

export interface StartChatResponse {
  success: true;
  chatId: string;
  requestedImageCount: number;
  model: ImageModelSummaryDto;
  imageSize: string;
  generatedPrompt: string | null;
  referenceImages: UploadedReferenceImageDto[];
  warnings: string[];
}

export interface ChatDetailResponse {
  success: true;
  id: string;
  location: string;
  timeOfDay: string;
  weather: string;
  aspectRatio: string;
  model: ImageModelSummaryDto;
  imageSize: string;
  requestedImageCount: number;
  generatedPrompt: string | null;
  referenceImages: UploadedReferenceImageDto[];
  images: GeneratedImageDto[];
}

export interface RefineImageResponse {
  success: true;
  imageId: string;
  mimeType: string;
  dataUrl: string;
  model: ImageModelSummaryDto;
  refineMs: number;
}

export interface StartChatParams {
  images: File[];
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
  imageCount: number;
  aspectRatio: string;
  modelKey?: string;
  imageSize?: string;
}
