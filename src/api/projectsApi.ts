import { apiDeleteJson, apiGet, apiPostForm, apiPostJson } from "./client";
import type {
  ProjectDetailResponse,
  ProjectListResponse,
  DeleteProjectImagesResponse,
  EditImagesParams,
  EditImagesResponse,
  GeneratedImageDto,
  GeneratePromptResponse,
  GenerateTitleResponse,
  ImageModelsResponse,
  RefineImageResponse,
  CreateProjectParams,
  CreateProjectResponse,
  SuccessResponse,
  UploadReferenceImageResponse,
} from "./projectTypes";

const BASE_PATH = "/api/projects";

export function getImageModels(accessToken: string, signal?: AbortSignal): Promise<ImageModelsResponse> {
  return apiGet<ImageModelsResponse>(`${BASE_PATH}/models`, { accessToken, signal });
}

/**
 * A user can have at most ImagePipelineOptions.MaxProjects (30) projects at all - creating
 * a 31st permanently deletes their oldest one server-side (see CreateProjectAsync). page is
 * 1-based; pageSize defaults to 12 server-side if omitted.
 */
export function listProjects(
  accessToken: string,
  params: { page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<ProjectListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet<ProjectListResponse>(`${BASE_PATH}${suffix}`, { accessToken, signal });
}

export function getProject(projectId: string, accessToken: string, signal?: AbortSignal): Promise<ProjectDetailResponse> {
  return apiGet<ProjectDetailResponse>(`${BASE_PATH}/${projectId}`, { accessToken, signal });
}

function buildCreateProjectForm(params: CreateProjectParams): FormData {
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

export function createProject(params: CreateProjectParams, accessToken: string, signal?: AbortSignal): Promise<CreateProjectResponse> {
  return apiPostForm<CreateProjectResponse>(BASE_PATH, buildCreateProjectForm(params), { accessToken, signal });
}

/** Runs Stage 1 (GPT master prompt) for a project that doesn't have one yet. Idempotent. */
export function generateProjectPrompt(projectId: string, accessToken: string, signal?: AbortSignal): Promise<GeneratePromptResponse> {
  return apiPostJson<GeneratePromptResponse>(`${BASE_PATH}/${projectId}/prompt`, {}, { accessToken, signal });
}

/** Runs the separate, fast, text-only title generation for a project that doesn't have one yet. Idempotent. */
export function generateProjectTitle(projectId: string, accessToken: string, signal?: AbortSignal): Promise<GenerateTitleResponse> {
  return apiPostJson<GenerateTitleResponse>(`${BASE_PATH}/${projectId}/title`, {}, { accessToken, signal });
}

/** Generates ONE image for a project slot. Call this once per index in parallel - each resolves independently. */
export function generateProjectImage(
  projectId: string,
  index: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<GeneratedImageDto> {
  return apiPostJson<GeneratedImageDto>(`${BASE_PATH}/${projectId}/images/${index}`, {}, { accessToken, signal });
}

export function refineImage(
  imageId: string,
  instruction: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RefineImageResponse> {
  return apiPostJson<RefineImageResponse>(`${BASE_PATH}/images/${imageId}/refine`, { instruction }, { accessToken, signal });
}

/** Adds one more uploaded/source image to an existing project (the small icon left of the project input, not the main-page dropzone). */
export function uploadReferenceImage(
  projectId: string,
  file: File,
  accessToken: string,
  signal?: AbortSignal,
): Promise<UploadReferenceImageResponse> {
  const form = new FormData();
  form.append("image", file);
  return apiPostForm<UploadReferenceImageResponse>(`${BASE_PATH}/${projectId}/images/upload`, form, { accessToken, signal });
}

/**
 * Applies one edit instruction to a project's images. The backend alone decides (from
 * selectedReferenceIndices) whether GPT is re-invoked or Gemini is called directly -
 * never inferred here from which UI affordance the user clicked.
 */
export function editImages(
  projectId: string,
  params: EditImagesParams,
  accessToken: string,
  signal?: AbortSignal,
): Promise<EditImagesResponse> {
  return apiPostJson<EditImagesResponse>(`${BASE_PATH}/${projectId}/edit`, params, { accessToken, signal });
}

/**
 * Removes a whole project from the project list. Soft server-side: the project and its images
 * survive for a retention window (30 days) and can be put back with restoreProject, because
 * deleting takes every generated image in the project with it.
 */
export function deleteProject(projectId: string, accessToken: string, signal?: AbortSignal): Promise<SuccessResponse> {
  return apiDeleteJson<SuccessResponse>(`${BASE_PATH}/${projectId}`, {}, { accessToken, signal });
}

/** Undoes deleteProject while the project is still inside its retention window. */
export function restoreProject(projectId: string, accessToken: string, signal?: AbortSignal): Promise<SuccessResponse> {
  return apiPostJson<SuccessResponse>(`${BASE_PATH}/${projectId}/restore`, {}, { accessToken, signal });
}

/** Permanently removes the given images (generated and/or uploaded/source) from a project. Unknown ids/indices are ignored. */
export function deleteProjectImages(
  projectId: string,
  generatedImageIds: string[],
  referenceIndices: number[],
  accessToken: string,
  signal?: AbortSignal,
): Promise<DeleteProjectImagesResponse> {
  return apiDeleteJson<DeleteProjectImagesResponse>(
    `${BASE_PATH}/${projectId}/images`,
    { generatedImageIds, referenceIndices },
    { accessToken, signal },
  );
}
