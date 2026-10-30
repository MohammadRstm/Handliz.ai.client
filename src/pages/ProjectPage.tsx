import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as projectsApi from "../api/projectsApi";
import { ApiError, imageUrl } from "../api/client";
import type {
  ProjectDetailResponse,
  GeneratedImageDto,
  ImageModelsResponse,
  ProjectMaterialsResponse,
  TimeOfDay,
  UploadedReferenceImageDto,
  WeatherCondition,
} from "../api/projectTypes";
import { useAuth } from "../auth/useAuth";
import { AccountMenu } from "../components/AccountMenu";
import { AspectRatioIcon, AspectRatioPicker } from "../components/AspectRatioPicker";
import { ProjectImageTile } from "../components/ProjectImageTile";
import { Dropdown } from "../components/Dropdown";
import { ErrorBanner } from "../components/ErrorBanner";
import { AttachIcon, BackArrowIcon, ChevronUpDownIcon, HamburgerIcon } from "../components/icons";
import { ApproveConceptDialog, type ApproveSettings } from "../components/ApproveConceptDialog";
import { Lightbox, type LightboxItem } from "../components/Lightbox";
import { MaterialAreaEditor } from "../components/MaterialAreaEditor";
import { MaterialOverlay, type DotStyle } from "../components/MaterialOverlay";
import { MaterialsPanel } from "../components/MaterialsPanel";
import { ModelPicker } from "../components/ModelPicker";
import { Spinner } from "../components/Spinner";
import { MAX_INSTRUCTION_LENGTH, TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import { UsageRing } from "../usage/UsageRing";
import { useUsage } from "../usage/useUsage";
import styles from "./ProjectPage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { accessToken } = useAuth();
  const { refresh: refreshUsage } = useUsage();

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [catalog, setCatalog] = useState<ImageModelsResponse | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [images, setImages] = useState<GeneratedImageDto[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedReferenceImageDto[]>([]);
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

  // The images the project originally started with never carry the "Added" badge - only
  // images uploaded later, in-project, do (Chunk 5). Captured once, at load.
  const originalReferenceCount = useRef<number | null>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Manual selection for editing (Chunks 7/8) - two distinct sets, never merged, so the
  // state model itself (not array ordering or a UI label) is what keeps "uploaded" and
  // "generated" apart. Empty-both is the default: apply to every currently generated
  // image, never to uploaded ones.
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState<Set<string>>(new Set());
  const [selectedReferenceIndices, setSelectedReferenceIndices] = useState<Set<number>>(new Set());

  const [instruction, setInstruction] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<Error | null>(null);

  // Loading feedback while an edit is in flight: the Gemini-only branch refines specific
  // existing tiles in place (their ids tracked here so ProjectImageTile can overlay a
  // spinner on top of the still-visible image), while the GPT branch produces brand-new
  // images with no ids yet - pendingNewImageCount reserves that many loading placeholder
  // tiles until the real ones arrive. Exactly one of the two is ever non-empty per request.
  const [refiningImageIds, setRefiningImageIds] = useState<Set<string>>(new Set());
  const [pendingNewImageCount, setPendingNewImageCount] = useState(0);

  // In-project editable generation parameters (Chunk 9) - seeded from the project's current
  // values once it loads, then editable via the settings dropdown. Sent with every edit
  // request; the backend both applies them to that request and persists them as the
  // project's new current values for subsequent ones.
  const [editTimeOfDay, setEditTimeOfDay] = useState<TimeOfDay>("GoldenHour");
  const [editWeather, setEditWeather] = useState<WeatherCondition>("Clear");
  const [editLocation, setEditLocation] = useState("");
  const [editAspectRatio, setEditAspectRatio] = useState("");
  const [editImageCount, setEditImageCount] = useState(1);
  const [editModelKey, setEditModelKey] = useState("");
  const [editImageSize, setEditImageSize] = useState("");

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  // The project's material concept (see MaterialsPanel). Mirrored into a ref because the
  // image-generation callbacks that decide whether to label it are created before it loads.
  const [concept, setConcept] = useState<ProjectMaterialsResponse | null>(null);
  const conceptRef = useRef<ProjectMaterialsResponse | null>(null);
  const [isLabelling, setIsLabelling] = useState(false);
  const [conceptError, setConceptError] = useState<Error | null>(null);
  const labelInFlight = useRef(false);

  // Hover and click-to-pin on materials, shared by the panel list and whichever overlay is
  // showing them, so pointing at a row lights its surfaces on the image and vice versa.
  const [hoveredMaterialId, setHoveredMaterialId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  // Even grid or scattered dots - a viewing preference, so it is remembered in this
  // browser only. Storage can be unavailable (private windows), hence the try/catch.
  const [dotStyle, setDotStyle] = useState<DotStyle>(() => {
    try {
      return localStorage.getItem("handliz.dotStyle") === "random" ? "random" : "even";
    } catch {
      return "even";
    }
  });
  const changeDotStyle = (style: DotStyle) => {
    setDotStyle(style);
    try {
      localStorage.setItem("handliz.dotStyle", style);
    } catch {
      // Not remembered; the choice still applies for this visit.
    }
  };

  // The review step: a new project renders only its concept image; the batch waits for the
  // user to approve the materials (see the backend's ApproveConceptAsync).
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<Error | null>(null);
  const [isRetryingConcept, setIsRetryingConcept] = useState(false);
  const [isAreaEditorOpen, setIsAreaEditorOpen] = useState(false);

  useEffect(() => {
    conceptRef.current = concept;
  }, [concept]);

  // Labelling is a separate ~10 s Gemini call the backend keeps out of image generation,
  // so the first image isn't held back by it - the client asks for it as soon as the
  // concept looks unlabelled. One call at a time: the first batch's images finish within
  // seconds of each other, and the backend's labelled check isn't a lock.
  const labelConceptIfNeeded = useCallback(
    (targetProjectId: string) => {
      const current = conceptRef.current;
      if (!accessToken || labelInFlight.current || !current || current.materials.length === 0 || current.conceptLabelled) return;
      labelInFlight.current = true;
      setIsLabelling(true);
      setConceptError(null);
      projectsApi
        .labelConceptImage(targetProjectId, accessToken)
        .then(setConcept)
        .catch((err) => setConceptError(toError(err)))
        .finally(() => {
          labelInFlight.current = false;
          setIsLabelling(false);
        });
    },
    [accessToken],
  );

  const imagesKickedOffForProjectId = useRef<string | null>(null);
  const promptKickedOffForProjectId = useRef<string | null>(null);
  const titleKickedOffForProjectId = useRef<string | null>(null);

  const generateIndex = useCallback(
    (targetProjectId: string, index: number) => {
      if (!accessToken) return;
      setFailedIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setGeneratingIndices((prev) => new Set(prev).add(index));

      projectsApi
        .generateProjectImage(targetProjectId, index, accessToken)
        .then((dto) => {
          setImages((prev) => [...prev.filter((img) => img.index !== index), dto].sort((a, b) => a.index - b.index));
          // The first image of the first batch to land becomes the concept image server-side,
          // so the concept is ready to label from here. A no-op once it is labelled.
          labelConceptIfNeeded(targetProjectId);
          // Only on success: a failed call releases its credit hold rather than spending
          // it (see the backend's fail-open metering), so usage genuinely hasn't changed
          // when this rejects - refreshing there would just be a wasted round trip.
          refreshUsage();
        })
        .catch(() => {
          setFailedIndices((prev) => new Set(prev).add(index));
        })
        .finally(() => {
          setGeneratingIndices((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        });
    },
    [accessToken, refreshUsage, labelConceptIfNeeded],
  );

  const kickOffMissingImages = useCallback(
    (targetProjectId: string, requestedImageCount: number, presentIndices: Set<number>) => {
      if (imagesKickedOffForProjectId.current === targetProjectId) return;
      imagesKickedOffForProjectId.current = targetProjectId;
      for (let i = 0; i < requestedImageCount; i++) {
        if (!presentIndices.has(i)) {
          generateIndex(targetProjectId, i);
        }
      }
    },
    [generateIndex],
  );

  // Stage 1, then the images. The prompt step also chooses the materials, which decides
  // whether the project opens with only its concept image (materials to review) or goes
  // straight to its full batch (none chosen) - so the project is re-read before any image is
  // requested. A callback rather than inline in the load effect because Try again runs it again.
  const runPromptStep = useCallback(
    (targetProjectId: string) => {
      if (!accessToken || promptKickedOffForProjectId.current === targetProjectId) return;
      promptKickedOffForProjectId.current = targetProjectId;
      projectsApi
        .generateProjectPrompt(targetProjectId, accessToken)
        .then(() => projectsApi.getProject(targetProjectId, accessToken))
        .then((refreshed) => {
          setProject(refreshed);
          setConcept(refreshed.concept);
          conceptRef.current = refreshed.concept;
          refreshUsage();
          kickOffMissingImages(targetProjectId, refreshed.requestedImageCount, new Set(refreshed.images.map((img) => img.index)));
        })
        .catch((err) => setLoadError(toError(err)));
    },
    [accessToken, kickOffMissingImages, refreshUsage],
  );

  // Load the project, then:
  //  - if it has no title yet, fetch one (fast, text-only) - independent of everything
  //    else, so it typically appears well before the images do.
  //  - if it has no prompt yet, fetch one (Stage 1, slower - analyzes the reference
  //    photos) and only THEN kick off image generation for missing slots, since Gemini
  //    needs that prompt. If the prompt is already present (a project opened before, or
  //    reopened after a previous attempt), skip straight to image generation.
  // Each step is guarded by its own ref so React StrictMode's double-invoke (or a
  // re-render) never fires the same project's title/prompt/images more than once.
  useEffect(() => {
    if (!projectId || !accessToken) return;
    let cancelled = false;

    Promise.all([projectsApi.getProject(projectId, accessToken), projectsApi.getImageModels(accessToken)])
      .then(([response, models]) => {
        if (cancelled) return;
        setProject(response);
        setCatalog(models);
        setImages(response.images);
        setUploadedImages(response.referenceImages);
        setConcept(response.concept);
        conceptRef.current = response.concept;
        originalReferenceCount.current = response.referenceImages.length;
        // Covers a project reopened after its labelling call failed or was cut short.
        if (response.concept.conceptImageId) labelConceptIfNeeded(projectId);

        setEditTimeOfDay(response.timeOfDay as TimeOfDay);
        setEditWeather(response.weather as WeatherCondition);
        setEditLocation(response.location);
        setEditAspectRatio(response.aspectRatio);
        setEditImageCount(Math.min(response.imageCountPerBatch || 1, models.maxGeneratedImages));
        setEditModelKey(response.model.key);
        setEditImageSize(response.imageSize);

        if (!response.title && titleKickedOffForProjectId.current !== projectId) {
          titleKickedOffForProjectId.current = projectId;
          projectsApi
            .generateProjectTitle(projectId, accessToken)
            .then((titleResponse) => {
              if (cancelled) return;
              setProject((prev) => (prev ? { ...prev, title: titleResponse.title } : prev));
            })
            .catch(() => {
              // Non-critical: the location keeps serving as the displayed title.
            });
        }

        const presentIndices = new Set(response.images.map((img) => img.index));

        if (response.generatedPrompt) {
          kickOffMissingImages(projectId, response.requestedImageCount, presentIndices);
          return;
        }

        runPromptStep(projectId);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toError(err));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, accessToken]);

  const lightboxItems: LightboxItem[] = useMemo(() => {
    const generatedItems: LightboxItem[] = images
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((img) => ({
        id: img.imageId,
        src: imageUrl(img.url),
        thumbnailSrc: imageUrl(img.thumbnailUrl),
        label: `Generated image ${img.index + 1}`,
      }));
    const referenceItems: LightboxItem[] = uploadedImages.map((ref) => ({
      id: `reference-${ref.index}`,
      src: imageUrl(ref.url),
      thumbnailSrc: imageUrl(ref.thumbnailUrl),
      label: `Reference photo ${ref.index + 1}`,
    }));
    // Same order as the grid renders them (references first), so stepping through the
    // viewer with the arrows follows the order the user is looking at.
    return [...referenceItems, ...generatedItems];
  }, [images, uploadedImages]);

  const handleSelectModel = (key: string) => {
    setEditModelKey(key);
    const model = catalog?.models.find((m) => m.key === key);
    if (model) setEditImageSize(model.defaultImageSize);
  };

  const handleDeleteSelected = useCallback(async () => {
    if (!projectId || !accessToken || isDeleting || isEditing) return;
    if (selectedGeneratedIds.size === 0 && selectedReferenceIndices.size === 0) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await projectsApi.deleteProjectImages(projectId, Array.from(selectedGeneratedIds), Array.from(selectedReferenceIndices), accessToken);
      // Re-fetch rather than patch local state: deleting a generated image re-numbers
      // every remaining one server-side to close the gap (see DeleteProjectImagesAsync), so
      // a simple local filter would leave stale indices that no longer match the server.
      const refreshed = await projectsApi.getProject(projectId, accessToken);
      setProject(refreshed);
      setImages(refreshed.images);
      setUploadedImages(refreshed.referenceImages);
      // Deleting the concept image leaves the project without one (the materials stay).
      setConcept(refreshed.concept);
      setSelectedGeneratedIds(new Set());
      setSelectedReferenceIndices(new Set());
    } catch (err) {
      setDeleteError(toError(err));
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, accessToken, isDeleting, isEditing, selectedGeneratedIds, selectedReferenceIndices]);

  // Backspace (and, defensively, Delete) previously risked triggering a browser's native
  // "navigate back" behavior when focus isn't in a text field - unmounting this page and
  // reading, to a user who'd just selected an image, as the image having vanished. Now
  // that there's an actual delete action to take, both keys are still fully blocked from
  // reaching any native handling outside real text inputs, but a non-empty selection
  // triggers that deletion instead of only clearing the checkmarks.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isEditable) return;

      event.preventDefault();
      if (selectedGeneratedIds.size > 0 || selectedReferenceIndices.size > 0) {
        void handleDeleteSelected();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedGeneratedIds, selectedReferenceIndices, handleDeleteSelected]);

  const openLightbox = (itemId: string) => {
    const index = lightboxItems.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    setLightboxIndex(index);
  };

  const toggleGeneratedSelection = (imageId: string) => {
    setSelectedGeneratedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const toggleReferenceSelection = (index: number) => {
    setSelectedReferenceIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRenameMaterial = async (materialId: string, name: string) => {
    if (!projectId || !accessToken) return;
    setConceptError(null);
    try {
      setConcept(await projectsApi.renameMaterials(projectId, [{ id: materialId, name }], accessToken));
    } catch (err) {
      setConceptError(toError(err));
      throw err;
    }
  };

  // Throws so the editor can show the save as failed; the result keeps the panel in step.
  const handleSaveAreas = useCallback(
    async (materialId: string, polygons: [number, number][][]) => {
      if (!projectId || !accessToken) return;
      const updated = await projectsApi.updateMaterialAreas(projectId, materialId, polygons, accessToken);
      setConcept(updated);
      conceptRef.current = updated;
    },
    [projectId, accessToken],
  );

  const handleSetConcept = async (imageId: string) => {
    if (!projectId || !accessToken || isLabelling) return;
    setConceptError(null);
    try {
      const updated = await projectsApi.setConceptImage(projectId, imageId, accessToken);
      setConcept(updated);
      conceptRef.current = updated;
      labelConceptIfNeeded(projectId);
    } catch (err) {
      setConceptError(toError(err));
    }
  };

  const handleApproveConcept = async (settings: ApproveSettings) => {
    if (!projectId || !accessToken || isApproving) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const result = await projectsApi.approveConcept(projectId, settings, accessToken);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              conceptApproved: true,
              requestedImageCount: result.requestedImageCount,
              imageCountPerBatch: result.imageCount,
              model: result.model,
              imageSize: result.imageSize,
            }
          : prev,
      );
      setEditModelKey(result.model.key);
      setEditImageSize(result.imageSize);
      setEditImageCount(result.imageCount);
      setIsApproveOpen(false);
      setSelectedMaterialId(null);
      // Same one-call-per-image fan-out as a new project's first batch.
      for (let i = result.firstNewIndex; i < result.requestedImageCount; i++) {
        generateIndex(projectId, i);
      }
      if (result.promptRevised) refreshUsage();
    } catch (err) {
      setApproveError(toError(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleRetryConcept = async () => {
    if (!projectId || !accessToken || isRetryingConcept) return;
    if (!window.confirm("Render a new concept image and choose the materials again? This uses credits.")) return;
    setIsRetryingConcept(true);
    setConceptError(null);
    try {
      await projectsApi.retryConcept(projectId, accessToken);
      const emptyConcept: ProjectMaterialsResponse = {
        success: true,
        conceptImageId: null,
        conceptVersion: 0,
        conceptLabelled: false,
        materials: [],
      };
      setImages([]);
      setFailedIndices(new Set());
      setConcept(emptyConcept);
      conceptRef.current = emptyConcept;
      setHoveredMaterialId(null);
      setSelectedMaterialId(null);
      setProject((prev) => (prev ? { ...prev, generatedPrompt: null, requestedImageCount: 1 } : prev));
      // Cleared so the prompt and the concept image run again for this same project.
      promptKickedOffForProjectId.current = null;
      imagesKickedOffForProjectId.current = null;
      runPromptStep(projectId);
    } catch (err) {
      setConceptError(toError(err));
    } finally {
      setIsRetryingConcept(false);
    }
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file || !projectId || !accessToken || isDeleting) return;

    setIsUploadingImage(true);
    setUploadError(null);
    try {
      const response = await projectsApi.uploadReferenceImage(projectId, file, accessToken);
      setUploadedImages((prev) => [...prev, response.referenceImage]);
    } catch (err) {
      setUploadError(toError(err));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const hasSelection = selectedGeneratedIds.size > 0 || selectedReferenceIndices.size > 0;
  // Mirrors the backend's own branch decision (EditProjectImagesAsync): any uploaded/source
  // image in the selection re-invokes the full GPT -> Gemini pipeline, which is a
  // meaningful action on its own - free text is only required for the Gemini-only refine
  // branch, which has no other action to take.
  const willUseGpt = selectedReferenceIndices.size > 0;
  // A parameter actually differing from the project's current persisted value is itself a
  // request to update the photo, same as typing a change would be - mirrors the backend's
  // own hasParamChanges check in EditProjectImagesAsync. ImageCount is deliberately excluded:
  // it only governs how many brand-new images the GPT branch produces, so changing it has
  // no effect on a Gemini-only refine and shouldn't unlock submitting with no instruction.
  const hasParamChanges = project
    ? editTimeOfDay !== project.timeOfDay ||
      editWeather !== project.weather ||
      editLocation.trim() !== project.location ||
      editAspectRatio !== project.aspectRatio ||
      editModelKey !== project.model.key ||
      editImageSize !== project.imageSize
    : false;
  const canSubmit = instruction.trim().length > 0 || willUseGpt || hasParamChanges;

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || !accessToken || !canSubmit || isEditing || isDeleting) return;

    setIsEditing(true);
    setEditError(null);
    if (willUseGpt) {
      setPendingNewImageCount(editImageCount);
    } else {
      const targetIds = selectedGeneratedIds.size > 0 ? selectedGeneratedIds : new Set(images.map((img) => img.imageId));
      setRefiningImageIds(targetIds);
    }
    try {
      const response = await projectsApi.editImages(
        projectId,
        {
          instruction: instruction.trim(),
          selectedGeneratedImageIds: Array.from(selectedGeneratedIds),
          selectedReferenceIndices: Array.from(selectedReferenceIndices),
          timeOfDay: editTimeOfDay,
          weather: editWeather,
          location: editLocation,
          aspectRatio: editAspectRatio,
          imageCount: editImageCount,
          modelKey: editModelKey,
          imageSize: editImageSize,
        },
        accessToken,
      );

      if (response.usedGpt) {
        setImages((prev) => [...prev, ...response.newImages].sort((a, b) => a.index - b.index));
      } else {
        setImages((prev) =>
          prev.map((img) => response.updatedImages.find((u) => u.imageId === img.imageId) ?? img),
        );
      }
      const selectedModel = catalog?.models.find((m) => m.key === editModelKey);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              requestedImageCount: response.requestedImageCount,
              timeOfDay: editTimeOfDay,
              weather: editWeather,
              location: editLocation,
              aspectRatio: editAspectRatio,
              imageSize: editImageSize,
              model: selectedModel ? { key: selectedModel.key, displayName: selectedModel.displayName } : prev.model,
            }
          : prev,
      );
      setInstruction("");
      setSelectedGeneratedIds(new Set());
      setSelectedReferenceIndices(new Set());
      // A partial failure (some images in the batch failed) still resolves rather than
      // throwing here - see RunRefineOnlyBranchAsync/RunGptEditBranchAsync - and still
      // settles credits for whichever images succeeded, so this fires on that path too.
      refreshUsage();
    } catch (err) {
      setEditError(toError(err));
    } finally {
      setIsEditing(false);
      setRefiningImageIds(new Set());
      setPendingNewImageCount(0);
    }
  };

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.errorWrap}>
          <ErrorBanner error={loadError} />
          <Link to="/" className={styles.backLink}>
            ← Back to projects
          </Link>
        </div>
      </div>
    );
  }

  if (!project || !catalog) {
    return (
      <div className={styles.loadingPage}>
        <Spinner label="Loading project..." />
      </div>
    );
  }

  // Projects from before the material concept existed (and any where GPT found nothing
  // worth pinning down) have no materials - they keep the single-column layout.
  const showMaterials = (concept?.materials.length ?? 0) > 0;
  const conceptImage = concept?.conceptImageId ? images.find((img) => img.imageId === concept.conceptImageId) : undefined;
  // While reviewing, the concept image is shown full size in place of the grid. Its id is
  // only known once labelling returns, so until then slot 0 stands in - it is the only image.
  const inReview = !project.conceptApproved;
  const reviewImage = conceptImage ?? images.find((img) => img.index === 0);
  const activeMaterialId = hoveredMaterialId ?? selectedMaterialId;

  return (
    <div className={`${styles.page} ${showMaterials ? styles.withMaterials : ""}`}>
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link to="/" className={styles.backIconLink} aria-label="Back to projects" title="Back to projects">
            <BackArrowIcon />
          </Link>
          <div className={styles.headerActions}>
            <UsageRing />
            <AccountMenu />
          </div>
        </div>
        <h1 className={styles.title}>
          {project.title ?? project.location}
          {!project.title && <span className={styles.titleLoading} aria-label="Generating title" />}
        </h1>
        <div className={styles.summary}>
          {project.model.displayName} · {project.imageSize} · {project.aspectRatio} · {project.timeOfDay} · {project.weather}
        </div>
      </header>

      <div className={styles.workspace}>
        <main className={styles.main}>
          {inReview ? (
            <section className={styles.stage} aria-label="Concept image">
              {reviewImage ? (
                <div className={styles.stageImage}>
                  <MaterialOverlay
                    src={imageUrl(reviewImage.url)}
                    alt="Concept image"
                    materials={concept?.materials ?? []}
                    activeId={activeMaterialId}
                    selectedId={selectedMaterialId}
                    onHover={setHoveredMaterialId}
                    onSelect={setSelectedMaterialId}
                    dotStyle={dotStyle}
                  />
                  {isLabelling && (
                    <div className={styles.stageBusy}>
                      <Spinner />
                      <span>Tracing the materials...</span>
                    </div>
                  )}
                </div>
              ) : failedIndices.has(0) ? (
                <div className={styles.stagePlaceholder}>
                  <span>The concept image failed to generate.</span>
                  <button type="button" className={styles.stageRetry} onClick={() => projectId && generateIndex(projectId, 0)}>
                    Retry
                  </button>
                </div>
              ) : (
                <div className={styles.stagePlaceholder}>
                  <Spinner />
                  <span>{showMaterials ? "Rendering the concept image..." : "Choosing the main materials..."}</span>
                </div>
              )}
              <p className={styles.stageHint}>
                One image first, to agree the materials. Hover or click a material to see where it goes - your{" "}
                {project.imageCountPerBatch === 1 ? "image is" : `${project.imageCountPerBatch} images are`} generated after you approve.
              </p>
            </section>
          ) : (
            <div className={styles.grid}>
              {uploadedImages.map((ref) => (
                <ProjectImageTile
                  key={`reference-${ref.index}`}
                  status="loaded"
                  src={imageUrl(ref.thumbnailUrl)}
                  label={`Reference photo ${ref.index + 1}`}
                  isChecked={selectedReferenceIndices.has(ref.index)}
                  onToggleCheck={() => toggleReferenceSelection(ref.index)}
                  isNewlyAdded={originalReferenceCount.current !== null && ref.index >= originalReferenceCount.current}
                  onClick={() => openLightbox(`reference-${ref.index}`)}
                />
              ))}

              {Array.from({ length: project.requestedImageCount }, (_, index) => {
                const image = images.find((img) => img.index === index);
                if (image) {
                  return (
                    <ProjectImageTile
                      key={`generated-${index}`}
                      status="loaded"
                      src={imageUrl(image.thumbnailUrl)}
                      label={`Generated image ${index + 1}`}
                      isChecked={selectedGeneratedIds.has(image.imageId)}
                      onToggleCheck={() => toggleGeneratedSelection(image.imageId)}
                      isRefining={refiningImageIds.has(image.imageId)}
                      isConcept={showMaterials && image.imageId === concept?.conceptImageId}
                      onSetConcept={showMaterials ? () => void handleSetConcept(image.imageId) : undefined}
                      onClick={() => openLightbox(image.imageId)}
                    />
                  );
                }
                if (failedIndices.has(index)) {
                  return (
                    <ProjectImageTile
                      key={`generated-${index}`}
                      status="failed"
                      label={`Image ${index + 1}`}
                      onRetry={() => projectId && generateIndex(projectId, index)}
                    />
                  );
                }
                return <ProjectImageTile key={`generated-${index}`} status="loading" label={`Image ${index + 1}`} />;
              })}

              {Array.from({ length: pendingNewImageCount }, (_, i) => (
                <ProjectImageTile key={`pending-new-${i}`} status="loading" label="Generating new image..." />
              ))}
            </div>
          )}

          {generatingIndices.size === 0 && !inReview && (
            <form className={styles.refineBar} onSubmit={handleEdit}>
              <div className={styles.refineTarget}>
                {hasSelection
                  ? `Editing ${selectedGeneratedIds.size + selectedReferenceIndices.size} selected image(s) · Press Delete to remove`
                  : images.length > 0
                    ? "Editing all recently generated images"
                    : "Select a photo above, or attach a new one, to generate images"}
              </div>
              <div className={styles.refineInputRow}>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelected} />
                <button
                  type="button"
                  className={styles.attachButton}
                  onClick={handleAttachClick}
                  disabled={isUploadingImage || isEditing || isDeleting}
                  aria-label="Add another photo to this project"
                  title="Add another photo to this project"
                >
                  {isUploadingImage ? <Spinner /> : <AttachIcon />}
                </button>

                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={
                    hasSelection ? "Edit only the selected images..." : "Describe an edit to apply to your recent images..."
                  }
                  maxLength={MAX_INSTRUCTION_LENGTH}
                  disabled={isEditing || isDeleting}
                  className={styles.refineInput}
                />

                <Dropdown trigger={<HamburgerIcon />} align="right" disabled={isEditing || isDeleting}>
                  <label className={styles.settingField}>
                    <span>Time of day</span>
                    <select value={editTimeOfDay} onChange={(e) => setEditTimeOfDay(e.target.value as TimeOfDay)}>
                      {TIME_OF_DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.settingField}>
                    <span>Weather</span>
                    <select value={editWeather} onChange={(e) => setEditWeather(e.target.value as WeatherCondition)}>
                      {WEATHER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.settingField}>
                    <span>Location</span>
                    <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} maxLength={200} />
                  </label>
                  <label className={styles.settingField}>
                    <span>Number of new images</span>
                    <select value={editImageCount} onChange={(e) => setEditImageCount(Number(e.target.value))}>
                      {Array.from({ length: catalog.maxGeneratedImages }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.settingField}>
                    <span>Aspect ratio</span>
                    <AspectRatioPicker ratios={catalog.supportedAspectRatios} selected={editAspectRatio} onSelect={setEditAspectRatio} />
                  </div>
                </Dropdown>

                <div className={styles.lockedDropdown} title="Current aspect ratio">
                  <AspectRatioIcon ratio={editAspectRatio} />
                  {editAspectRatio}
                </div>

                <Dropdown
                  trigger={
                    <span className={styles.modelTrigger}>
                      {catalog.models.find((m) => m.key === editModelKey)?.displayName ?? "Model"}
                      <ChevronUpDownIcon />
                    </span>
                  }
                  align="right"
                  disabled={isEditing || isDeleting}
                >
                  <ModelPicker
                    models={catalog.models}
                    selectedKey={editModelKey}
                    onSelectKey={handleSelectModel}
                    selectedImageSize={editImageSize}
                    onSelectImageSize={setEditImageSize}
                    disabled={isEditing || isDeleting}
                  />
                </Dropdown>

                <button type="submit" className={styles.sendButton} disabled={!canSubmit || isEditing || isDeleting}>
                  {isEditing ? <Spinner /> : "Send"}
                </button>
              </div>
              {uploadError && <ErrorBanner error={uploadError} onDismiss={() => setUploadError(null)} />}
              {editError && <ErrorBanner error={editError} onDismiss={() => setEditError(null)} />}
              {deleteError && <ErrorBanner error={deleteError} onDismiss={() => setDeleteError(null)} />}
            </form>
          )}
        </main>

        {showMaterials && concept && (
          <div className={styles.side}>
            <MaterialsPanel
              concept={concept}
              conceptImageSrc={!inReview && conceptImage ? imageUrl(conceptImage.thumbnailUrl) : null}
              hasGeneratedImages={images.length > 0}
              isLabelling={isLabelling}
              hoveredId={hoveredMaterialId}
              selectedId={selectedMaterialId}
              onHover={setHoveredMaterialId}
              onSelect={setSelectedMaterialId}
              onRename={handleRenameMaterial}
              dotStyle={dotStyle}
              onDotStyleChange={changeDotStyle}
              onEditAreas={
                concept.conceptLabelled && conceptImage && !isLabelling
                  ? () => {
                      setHoveredMaterialId(null);
                      setIsAreaEditorOpen(true);
                    }
                  : undefined
              }
              onOpenConceptImage={conceptImage ? () => openLightbox(conceptImage.imageId) : undefined}
              review={
                inReview
                  ? {
                      canApprove: reviewImage != null && !isLabelling && generatingIndices.size === 0,
                      isBusy: isApproving || isRetryingConcept,
                      onApprove: () => {
                        setApproveError(null);
                        setIsApproveOpen(true);
                      },
                      onRetry: () => void handleRetryConcept(),
                    }
                  : undefined
              }
            />
            {conceptError && <ErrorBanner error={conceptError} onDismiss={() => setConceptError(null)} />}
          </div>
        )}
      </div>

      {isAreaEditorOpen && concept && conceptImage && (
        <MaterialAreaEditor
          imageSrc={imageUrl(conceptImage.url)}
          materials={concept.materials}
          dotStyle={dotStyle}
          initialMaterialId={selectedMaterialId}
          onSave={handleSaveAreas}
          onClose={() => setIsAreaEditorOpen(false)}
        />
      )}

      {isApproveOpen && (
        <ApproveConceptDialog
          models={catalog.models}
          maxImages={catalog.maxGeneratedImages}
          initial={{
            imageCount: Math.min(project.imageCountPerBatch || 1, catalog.maxGeneratedImages),
            modelKey: project.model.key,
            imageSize: project.imageSize,
          }}
          scene={{ aspectRatio: project.aspectRatio, timeOfDay: project.timeOfDay, weather: project.weather, location: project.location }}
          isSubmitting={isApproving}
          error={approveError}
          onConfirm={(settings) => void handleApproveConcept(settings)}
          onCancel={() => setIsApproveOpen(false)}
        />
      )}

      {lightboxIndex !== null && (
        <Lightbox
          items={lightboxItems}
          activeIndex={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
