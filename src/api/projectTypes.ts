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

export interface ProjectSummaryDto {
  id: string;
  location: string;
  /** Null until GPT produces one - fall back to location for display until then. */
  title: string | null;
  lastUsedAtUtc: string;
  requestedImageCount: number;
  /**
   * API-relative, signed URL for a small preview, or null when the project has no image yet.
   * Prepend API_BASE_URL to use it. Image bytes are no longer inlined in JSON: this
   * response was 8 MB for four projects when they were.
   */
  thumbnailUrl: string | null;
}

export interface ProjectListResponse {
  success: true;
  projects: ProjectSummaryDto[];
  /** This user's full project count (not just projects.length) - derive page count from it. */
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface UploadedReferenceImageDto {
  index: number;
  mimeType: string;
  /** API-relative, signed URL for the full-size image - prepend API_BASE_URL. */
  url: string;
  /** Small variant, for grid tiles. Use `url` only where the image is actually shown large. */
  thumbnailUrl: string;
}

export interface GeneratedImageDto {
  imageId: string;
  index: number;
  mimeType: string;
  /** API-relative, signed URL for the full-size image - prepend API_BASE_URL. */
  url: string;
  /** Small variant, for grid tiles. Use `url` only where the image is actually shown large. */
  thumbnailUrl: string;
}

/** A fast, GPT-free DB write - no prompt, title, or images yet. Fetch those separately right after navigating in. */
export interface CreateProjectResponse {
  success: true;
  projectId: string;
  requestedImageCount: number;
  model: ImageModelSummaryDto;
  imageSize: string;
  referenceImages: UploadedReferenceImageDto[];
  warnings: string[];
}

/** Normalized 0-1000 against the image's own width/height, in Gemini's [ymin, xmin, ymax, xmax] order. */
export interface MaterialBoxDto {
  yMin: number;
  xMin: number;
  yMax: number;
  xMax: number;
}

export interface ProjectMaterialDto {
  id: string;
  /** "M1".."M5" - stable for the life of the material. */
  label: string;
  /** The only user-editable field. */
  name: string;
  /** Where GPT placed it on the building - shown, never edited. */
  regionDescription: string;
  order: number;
  /** Where it appears on the concept image, or null when it isn't labelled there (or wasn't found). */
  box: MaterialBoxDto | null;
  /**
   * Its outline on the concept image: one polygon per surface (each window, each wall face),
   * each a list of [y, x] points normalized 0-1000 like box. Null for images labelled before
   * outlines existed - fill the box instead.
   */
  polygons: [number, number][][] | null;
}

/**
 * The project's material concept: up to five dominant materials chosen by the first prompt
 * step, and the generated image they are labelled on. Empty materials means the project
 * predates the feature (or GPT found nothing worth pinning down) - show no panel.
 */
export interface ProjectMaterialsResponse {
  success: true;
  /** Null until the project's first image finishes. */
  conceptImageId: string | null;
  conceptVersion: number;
  /**
   * False with a conceptImageId and materials means labelConceptImage still needs calling;
   * true with no boxes means labelling ran and found none of the materials in view.
   */
  conceptLabelled: boolean;
  materials: ProjectMaterialDto[];
}

export interface ProjectDetailResponse {
  success: true;
  id: string;
  location: string;
  /** Null until GPT produces one via generateProjectTitle - fall back to location for display until then. */
  title: string | null;
  timeOfDay: string;
  weather: string;
  aspectRatio: string;
  model: ImageModelSummaryDto;
  imageSize: string;
  requestedImageCount: number;
  /** How many images one batch produces - the approval step's default count, and new-batch edits'. */
  imageCountPerBatch: number;
  /**
   * False while the user reviews the material concept: only the concept image (slot 0)
   * exists, and the batch waits for approveConcept.
   */
  conceptApproved: boolean;
  generatedPrompt: string | null;
  referenceImages: UploadedReferenceImageDto[];
  images: GeneratedImageDto[];
  concept: ProjectMaterialsResponse;
}

/** The batch approval opened: generate indices firstNewIndex .. requestedImageCount - 1, one call each, in parallel. */
export interface ApproveConceptResponse {
  success: true;
  requestedImageCount: number;
  firstNewIndex: number;
  imageCount: number;
  model: ImageModelSummaryDto;
  imageSize: string;
  /** A material was renamed during review, so the prompt was revised first (costs credits). */
  promptRevised: boolean;
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
  /** API-relative, signed URL - prepend API_BASE_URL. */
  url: string;
  model: ImageModelSummaryDto;
  refineMs: number;
}

export interface UploadReferenceImageResponse {
  success: true;
  referenceImage: UploadedReferenceImageDto;
}

/**
 * Which pipeline branch runs is decided entirely by selectedReferenceIndices (see the
 * backend's IImagePipeline.EditProjectImagesAsync): non-empty means at least one
 * uploaded/source image is part of the edit, which always re-invokes GPT; otherwise
 * Gemini is called directly against selectedGeneratedImageIds, or - if that's empty too,
 * the "nothing manually selected" default - every currently generated image. A non-null
 * parameter field both applies to this request and persists as the project's new current
 * value for later ones.
 */
export interface EditImagesParams {
  /** Required unless selectedReferenceIndices is non-empty - see the type doc above. */
  instruction: string;
  selectedGeneratedImageIds: string[];
  selectedReferenceIndices: number[];
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
  aspectRatio: string;
  imageCount: number;
  modelKey: string;
  imageSize: string;
}

export interface DeleteProjectImagesResponse {
  success: true;
  requestedImageCount: number;
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

export interface CreateProjectParams {
  images: File[];
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
  imageCount: number;
  aspectRatio: string;
  modelKey?: string;
  imageSize?: string;
}

/** Response for actions whose only outcome is "it worked" - project delete/restore. */
export interface SuccessResponse {
  success: true;
}
