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
  /** Null until GPT produces one - fall back to location for display until then. */
  title: string | null;
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

/** A fast, GPT-free DB write - no prompt, title, or images yet. Fetch those separately right after navigating in. */
export interface StartChatResponse {
  success: true;
  chatId: string;
  requestedImageCount: number;
  model: ImageModelSummaryDto;
  imageSize: string;
  referenceImages: UploadedReferenceImageDto[];
  warnings: string[];
}

export interface ChatDetailResponse {
  success: true;
  id: string;
  location: string;
  /** Null until GPT produces one via generateChatTitle - fall back to location for display until then. */
  title: string | null;
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

export interface GeneratePromptResponse {
  success: true;
  generatedPrompt: string;
}

export interface GenerateTitleResponse {
  success: true;
  title: string;
}

export interface RefineImageResponse {
  success: true;
  imageId: string;
  mimeType: string;
  dataUrl: string;
  model: ImageModelSummaryDto;
  refineMs: number;
}

export interface UploadReferenceImageResponse {
  success: true;
  referenceImage: UploadedReferenceImageDto;
}

/**
 * Which pipeline branch runs is decided entirely by selectedReferenceIndices (see the
 * backend's IImagePipeline.EditChatImagesAsync): non-empty means at least one
 * uploaded/source image is part of the edit, which always re-invokes GPT; otherwise
 * Gemini is called directly against selectedGeneratedImageIds, or - if that's empty too,
 * the "nothing manually selected" default - every currently generated image. A non-null
 * parameter field both applies to this request and persists as the chat's new current
 * value for later ones.
 */
export interface EditImagesParams {
  instruction: string;
  selectedGeneratedImageIds: string[];
  selectedReferenceIndices: number[];
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
  aspectRatio: string;
  imageCount: number;
}

export interface EditImagesResponse {
  success: true;
  usedGpt: boolean;
  /** Populated (same ids as before) when the Gemini-only refine branch ran. */
  updatedImages: GeneratedImageDto[];
  /** Populated (brand-new ids, appended past the end of the grid) when the GPT-re-prompt branch ran. */
  newImages: GeneratedImageDto[];
  requestedImageCount: number;
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
