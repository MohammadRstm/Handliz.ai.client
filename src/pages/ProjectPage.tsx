import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as projectsApi from "../api/projectsApi";
import { ApiError, imageUrl } from "../api/client";
import type {
  ProjectDetailResponse,
  EditImagesParams,
  GeneratedImageDto,
  ImageModelsResponse,
  ProjectMaterialDto,
  ProjectMaterialsResponse,
  TimeOfDay,
  UploadedReferenceImageDto,
  WeatherCondition,
} from "../api/projectTypes";
import { useAuth } from "../auth/useAuth";
import { AccountMenu } from "../components/AccountMenu";
import { AspectRatioIcon, AspectRatioPicker } from "../components/AspectRatioPicker";
import { ProjectImageTile } from "../components/ProjectImageTile";
import { ProjectTitle } from "../components/ProjectTitle";
import { Dropdown } from "../components/Dropdown";
import { ErrorBanner } from "../components/ErrorBanner";
import { BackArrowIcon, ChevronUpDownIcon, HamburgerIcon, PanelLeftIcon, PanelRightIcon } from "../components/icons";
import { GenerateFromPhotoDialog, type GenerateSettings } from "../components/GenerateFromPhotoDialog";
import { Lightbox, type LightboxItem } from "../components/Lightbox";
import { MaterialAreaEditor } from "../components/MaterialAreaEditor";
import { MaterialOverlay, type DotStyle } from "../components/MaterialOverlay";
import { MaterialsPanel } from "../components/MaterialsPanel";
import { ModelPicker } from "../components/ModelPicker";
import { Spinner } from "../components/Spinner";
import { AS_IMAGE, measureImage, nearestAspectRatio, resolveAspectRatio } from "../aspectRatio";
import { MAX_INSTRUCTION_LENGTH, TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import { UsageRing } from "../usage/UsageRing";
import { useUsage } from "../usage/useUsage";
import styles from "./ProjectPage.module.css";

/** A remembered on/off viewing preference. Storage can be unavailable (private windows), hence the try/catch. */
function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Not remembered; the choice still applies for this visit.
    }
  };
  return [value, update];
}

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

/** The image the materials are mapped on, however the project came by it. */
interface ConceptSource {
  src: string;
  thumbnailSrc: string;
  alt: string;
  lightboxId: string;
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
  // "generated" apart. Photos are selected in the left column, renders in the middle.
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
  // A ratio, or AS_IMAGE - resolved against the photo being rendered when a request is sent.
  const [editAspectRatio, setEditAspectRatio] = useState("");
  // Set once the user picks a ratio, so the load-time switch to "As image" never overrides them.
  const ratioChosen = useRef(false);
  const chooseAspectRatio = (ratio: string) => {
    ratioChosen.current = true;
    setEditAspectRatio(ratio);
  };
  // Each photo's nearest supported ratio, measured from its thumbnail (which keeps its proportions).
  const [photoRatios, setPhotoRatios] = useState<Record<number, string>>({});
  const instructionRef = useRef<HTMLInputElement>(null);
  const [editImageCount, setEditImageCount] = useState(1);
  const [editModelKey, setEditModelKey] = useState("");
  const [editImageSize, setEditImageSize] = useState("");

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [renameError, setRenameError] = useState<Error | null>(null);

  // The project's material concept (see MaterialsPanel). Mirrored into a ref because the
  // callbacks that decide whether to label it are created before it loads.
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
  // Either side column can be hidden to give the renders the room - remembered per browser.
  const [photosHidden, setPhotosHidden] = useStoredFlag("handliz.photosHidden");
  const [materialsHidden, setMaterialsHidden] = useStoredFlag("handliz.materialsHidden");

  const changeDotStyle = (style: DotStyle) => {
    setDotStyle(style);
    try {
      localStorage.setItem("handliz.dotStyle", style);
    } catch {
      // Not remembered; the choice still applies for this visit.
    }
  };

  // The review step: the materials are agreed on the user's own photo before anything is
  // rendered; approving them asks whether to render that photo now (see the backend's
  // ApproveConceptAsync, which only approves).
  const [isApproving, setIsApproving] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isRetryingConcept, setIsRetryingConcept] = useState(false);
  // Which material the area editor opens on, and whether straight into drawing - a material
  // just added has no area yet, so drawing one is the next thing to do.
  const [areaEditor, setAreaEditor] = useState<{ materialId: string | null; drawing: boolean } | null>(null);

  useEffect(() => {
    conceptRef.current = concept;
  }, [concept]);

  // Labelling is a separate ~10 s Gemini call, asked for as soon as the concept looks
  // unlabelled - for a new project, right after the prompt step chooses the materials. One
  // call at a time: the backend's labelled check isn't a lock.
  const labelConceptIfNeeded = useCallback(
    (targetProjectId: string) => {
      const current = conceptRef.current;
      if (!accessToken || labelInFlight.current || !current || current.materials.length === 0 || current.conceptLabelled) return;
      if (current.conceptReferenceIndex === null && !current.conceptImageId) return;
      labelInFlight.current = true;
      setIsLabelling(true);
      setConceptError(null);
      projectsApi
        .labelConceptImage(targetProjectId, accessToken)
        .then((labelled) => {
          setConcept(labelled);
          conceptRef.current = labelled;
        })
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

  // Open image slots - only older projects have these now; new projects render through
  // editImages once their materials are approved.
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
          // An older project's first image becomes its concept image server-side, so it is
          // ready to label from here. A no-op once it is labelled.
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

  // Stage 1: GPT reads the photo and chooses the materials, which are then mapped on it. The
  // project is re-read afterwards for the materials - and because a project where GPT found
  // none is approved on the spot, which goes straight to asking whether to render. A
  // callback rather than inline in the load effect because Try again runs it again.
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
          labelConceptIfNeeded(targetProjectId);
          if (refreshed.conceptApproved && refreshed.concept.materials.length === 0 && refreshed.images.length === 0) {
            setIsGenerateOpen(true);
          }
          kickOffMissingImages(targetProjectId, refreshed.requestedImageCount, new Set(refreshed.images.map((img) => img.index)));
        })
        .catch((err) => setLoadError(toError(err)));
    },
    [accessToken, kickOffMissingImages, labelConceptIfNeeded, refreshUsage],
  );

  // Load the project, then:
  //  - if it has no title yet, fetch one (fast, text-only) - independent of everything
  //    else, so it typically appears well before the materials do.
  //  - if it has no prompt yet, run the prompt step (it chooses the materials, which are
  //    then mapped on the photo). If the prompt is already present (a project opened
  //    before), map the materials if that didn't finish, and fill any open image slots.
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
        labelConceptIfNeeded(projectId);

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

  useEffect(() => {
    if (!catalog) return;
    let cancelled = false;
    for (const ref of uploadedImages) {
      if (photoRatios[ref.index]) continue;
      measureImage(imageUrl(ref.thumbnailUrl))
        .then(({ width, height }) => {
          const ratio = nearestAspectRatio(width, height, catalog.supportedAspectRatios);
          if (!cancelled && ratio) setPhotoRatios((prev) => ({ ...prev, [ref.index]: ratio }));
        })
        .catch(() => {
          // Unmeasured: "As image" falls back to the project's stored ratio.
        });
    }
    return () => {
      cancelled = true;
    };
    // photoRatios is read only to skip photos already measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImages, catalog]);

  const lightboxItems: LightboxItem[] = useMemo(() => {
    const generatedItems: LightboxItem[] = images
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((img) => ({
        id: img.imageId,
        src: imageUrl(img.url),
        thumbnailSrc: imageUrl(img.thumbnailUrl),
        label: generatedLabel(img),
      }));
    const referenceItems: LightboxItem[] = uploadedImages.map((ref) => ({
      id: `reference-${ref.index}`,
      src: imageUrl(ref.url),
      thumbnailSrc: imageUrl(ref.thumbnailUrl),
      label: `Photo ${ref.index + 1}`,
    }));
    // Same order as the page shows them (photos on the left first), so stepping through the
    // viewer with the arrows follows the order the user is looking at.
    return [...referenceItems, ...generatedItems];
  }, [images, uploadedImages]);

  const handleSelectModel = (key: string) => {
    setEditModelKey(key);
    const model = catalog?.models.find((m) => m.key === key);
    if (model) setEditImageSize(model.defaultImageSize);
  };

  const conceptReferenceIndex = concept?.conceptReferenceIndex ?? null;

  const handleDeleteSelected = useCallback(async () => {
    if (!projectId || !accessToken || isDeleting || isEditing) return;
    if (selectedGeneratedIds.size === 0 && selectedReferenceIndices.size === 0) return;
    // The original carries the material areas every render is placed from - the materials
    // themselves stay, but their areas go with it, so this one is worth a second look.
    if (
      conceptReferenceIndex !== null &&
      selectedReferenceIndices.has(conceptReferenceIndex) &&
      !window.confirm("Delete the original photo? The materials stay, but the areas you mapped on it are deleted with it.")
    ) {
      return;
    }

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
      // Deleting the image the materials are mapped on leaves them unmapped (they stay).
      setConcept(refreshed.concept);
      setSelectedGeneratedIds(new Set());
      setSelectedReferenceIndices(new Set());
    } catch (err) {
      setDeleteError(toError(err));
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, accessToken, isDeleting, isEditing, selectedGeneratedIds, selectedReferenceIndices, conceptReferenceIndex]);

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

  const handleRename = async (title: string) => {
    if (!projectId || !accessToken) return;
    setRenameError(null);
    try {
      const renamed = await projectsApi.renameProject(projectId, title, accessToken);
      setProject((prev) => (prev ? { ...prev, title: renamed.title } : prev));
    } catch (err) {
      setRenameError(toError(err));
      throw err;
    }
  };

  const applyConcept = (updated: ProjectMaterialsResponse) => {
    setConcept(updated);
    conceptRef.current = updated;
  };

  const handleRenameMaterial = async (materialId: string, name: string) => {
    if (!projectId || !accessToken) return;
    setConceptError(null);
    try {
      applyConcept(await projectsApi.renameMaterials(projectId, [{ id: materialId, name }], accessToken));
    } catch (err) {
      setConceptError(toError(err));
      throw err;
    }
  };

  const handleAddMaterial = async (name: string) => {
    if (!projectId || !accessToken) return;
    setConceptError(null);
    try {
      const before = new Set(conceptRef.current?.materials.map((m) => m.id) ?? []);
      const updated = await projectsApi.addMaterial(projectId, name, accessToken);
      applyConcept(updated);
      const added = updated.materials.find((m) => !before.has(m.id));
      if (added) {
        setSelectedMaterialId(added.id);
        // Placed by its area alone, so drawing one is the natural next step - possible
        // once the photo is mapped (the API refuses areas before that).
        if (updated.conceptLabelled) {
          setHoveredMaterialId(null);
          setAreaEditor({ materialId: added.id, drawing: true });
        }
      }
    } catch (err) {
      setConceptError(toError(err));
      throw err;
    }
  };

  const handleDeleteMaterial = async (material: ProjectMaterialDto) => {
    if (!projectId || !accessToken) return;
    if (!window.confirm(`Delete ${material.label}, “${material.name}”? Its areas are deleted with it.`)) return;
    setConceptError(null);
    try {
      applyConcept(await projectsApi.deleteMaterial(projectId, material.id, accessToken));
      if (selectedMaterialId === material.id) setSelectedMaterialId(null);
      setHoveredMaterialId(null);
    } catch (err) {
      setConceptError(toError(err));
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

  const handleApprove = async () => {
    if (!projectId || !accessToken || isApproving) return;
    setIsApproving(true);
    setConceptError(null);
    try {
      await projectsApi.approveConcept(projectId, accessToken);
      setProject((prev) => (prev ? { ...prev, conceptApproved: true } : prev));
      setSelectedMaterialId(null);
      setIsGenerateOpen(true);
    } catch (err) {
      setConceptError(toError(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleRetryConcept = async () => {
    if (!projectId || !accessToken || isRetryingConcept) return;
    if (!window.confirm("Read your photo again and choose the materials from scratch? Your changes to them are lost, and it uses credits.")) return;
    setIsRetryingConcept(true);
    setConceptError(null);
    try {
      await projectsApi.retryConcept(projectId, accessToken);
      const previous = conceptRef.current;
      // The photo stays the concept image; an older project's generated concept is discarded.
      const emptyConcept: ProjectMaterialsResponse = {
        success: true,
        conceptReferenceIndex: previous?.conceptReferenceIndex ?? null,
        conceptImageId: null,
        conceptVersion: 0,
        conceptLabelled: false,
        materials: [],
      };
      const renderedConcept = emptyConcept.conceptReferenceIndex === null;
      setImages([]);
      setFailedIndices(new Set());
      applyConcept(emptyConcept);
      setHoveredMaterialId(null);
      setSelectedMaterialId(null);
      setProject((prev) => (prev ? { ...prev, generatedPrompt: null, requestedImageCount: renderedConcept ? 1 : 0 } : prev));
      // Cleared so the prompt (and an older project's concept image) runs again for this project.
      promptKickedOffForProjectId.current = null;
      imagesKickedOffForProjectId.current = null;
      runPromptStep(projectId);
    } catch (err) {
      setConceptError(toError(err));
    } finally {
      setIsRetryingConcept(false);
    }
  };

  const originalPhoto =
    (conceptReferenceIndex !== null ? uploadedImages.find((ref) => ref.index === conceptReferenceIndex) : undefined) ?? uploadedImages[0];
  // "As image" follows the photo being rendered: the first one selected, else the original -
  // with nothing selected the API renders from the photos of the current prompt.
  const ratioPhotoIndex = selectedReferenceIndices.size > 0 ? Array.from(selectedReferenceIndices)[0] : originalPhoto?.index;
  const imageRatio = ratioPhotoIndex !== undefined ? (photoRatios[ratioPhotoIndex] ?? null) : null;
  const resolvedAspectRatio = resolveAspectRatio(editAspectRatio, imageRatio, project?.aspectRatio ?? "16:9");

  // A project whose ratio is already its original photo's opens with "As image" chosen - how
  // the home page creates projects by default - unless the user has picked one since.
  const originalRatio = originalPhoto ? photoRatios[originalPhoto.index] : undefined;
  useEffect(() => {
    if (ratioChosen.current || !project || !originalRatio) return;
    if (editAspectRatio === project.aspectRatio && originalRatio === project.aspectRatio) setEditAspectRatio(AS_IMAGE);
  }, [originalRatio, project, editAspectRatio]);

  const currentSettings = (): Omit<EditImagesParams, "instruction" | "selectedGeneratedImageIds" | "selectedReferenceIndices"> => ({
    timeOfDay: editTimeOfDay,
    weather: editWeather,
    location: editLocation,
    aspectRatio: resolvedAspectRatio,
    imageCount: editImageCount,
    modelKey: editModelKey,
    imageSize: editImageSize,
  });

  /** Runs one edit request; resolves true when it succeeded. Only one runs at a time (isEditing blocks the rest). */
  const runEdit = async (params: EditImagesParams): Promise<boolean> => {
    if (!projectId || !accessToken) return false;
    // Mirrors the backend's branch decision: a selected photo, or nothing selected, adds new images.
    const isNewBatch = params.selectedReferenceIndices.length > 0 || params.selectedGeneratedImageIds.length === 0;

    setIsEditing(true);
    setEditError(null);
    if (isNewBatch) {
      setPendingNewImageCount(params.imageCount);
    } else {
      setRefiningImageIds(new Set(params.selectedGeneratedImageIds));
    }
    try {
      const response = await projectsApi.editImages(projectId, params, accessToken);

      if (response.usedGpt) {
        setImages((prev) => [...prev, ...response.newImages].sort((a, b) => a.index - b.index));
      } else {
        setImages((prev) => prev.map((img) => response.updatedImages.find((u) => u.imageId === img.imageId) ?? img));
      }
      const selectedModel = catalog?.models.find((m) => m.key === params.modelKey);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              requestedImageCount: response.requestedImageCount,
              timeOfDay: params.timeOfDay,
              weather: params.weather,
              location: params.location,
              aspectRatio: params.aspectRatio,
              imageSize: params.imageSize,
              model: selectedModel ? { key: selectedModel.key, displayName: selectedModel.displayName } : prev.model,
            }
          : prev,
      );
      // A partial failure (some images in the batch failed) still resolves rather than
      // throwing here - see RunRefineOnlyBranchAsync/RunGptEditBranchAsync - and still
      // settles credits for whichever images succeeded, so this fires on that path too.
      refreshUsage();
      return true;
    } catch (err) {
      setEditError(toError(err));
      return false;
    } finally {
      setIsEditing(false);
      setRefiningImageIds(new Set());
      setPendingNewImageCount(0);
    }
  };

  const handleGenerateFromPhoto = (settings: GenerateSettings) => {
    setIsGenerateOpen(false);
    if (!originalPhoto || isEditing) return;
    // The bar keeps whatever was chosen here, as the project's settings from now on.
    setEditTimeOfDay(settings.timeOfDay);
    setEditWeather(settings.weather);
    setEditLocation(settings.location);
    chooseAspectRatio(settings.aspectRatio);
    setEditImageCount(settings.imageCount);
    setEditModelKey(settings.modelKey);
    setEditImageSize(settings.imageSize);
    void runEdit({
      instruction: "",
      selectedGeneratedImageIds: [],
      selectedReferenceIndices: [originalPhoto.index],
      ...settings,
      aspectRatio: resolveAspectRatio(settings.aspectRatio, photoRatios[originalPhoto.index], project?.aspectRatio ?? "16:9"),
    });
  };

  const handleAddPhotoClick = () => fileInputRef.current?.click();

  // Added photos are selected and wait for Generate, so the user can describe what they want
  // and adjust the settings first - rendering them on upload spent credits on settings the
  // user hadn't chosen yet. "As image" is pre-selected: renders keep the new photo's shape.
  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-selecting the same file later
    if (files.length === 0 || !projectId || !accessToken || isDeleting) return;

    setIsUploadingImage(true);
    setUploadError(null);
    const added: number[] = [];
    try {
      for (const file of files) {
        const response = await projectsApi.uploadReferenceImage(projectId, file, accessToken);
        setUploadedImages((prev) => [...prev, response.referenceImage]);
        added.push(response.referenceImage.index);
      }
    } catch (err) {
      setUploadError(toError(err));
    } finally {
      setIsUploadingImage(false);
      if (added.length > 0) {
        setSelectedGeneratedIds(new Set());
        setSelectedReferenceIndices(new Set(added));
        chooseAspectRatio(AS_IMAGE);
        instructionRef.current?.focus();
      }
    }
  };

  const hasSelection = selectedGeneratedIds.size > 0 || selectedReferenceIndices.size > 0;
  // Mirrors the backend's own branch decision (EditProjectImagesAsync): a selected
  // uploaded photo, or nothing selected at all, means a new batch of images - meaningful
  // on its own, so no text is required. Only selected generated images are edited in place,
  // and that is the one case needing an instruction (or a changed parameter).
  const willUseGpt = selectedReferenceIndices.size > 0 || !hasSelection;
  // A parameter actually differing from the project's current persisted value is itself a
  // request to update the photo, same as typing a change would be - mirrors the backend's
  // own hasParamChanges check in EditProjectImagesAsync. ImageCount is deliberately excluded:
  // it only governs how many brand-new images the GPT branch produces, so changing it has
  // no effect on a Gemini-only refine and shouldn't unlock submitting with no instruction.
  const hasParamChanges = project
    ? editTimeOfDay !== project.timeOfDay ||
      editWeather !== project.weather ||
      editLocation.trim() !== project.location ||
      resolvedAspectRatio !== project.aspectRatio ||
      editModelKey !== project.model.key ||
      editImageSize !== project.imageSize
    : false;
  const isBusy = isEditing;
  const canSubmit = instruction.trim().length > 0 || willUseGpt || hasParamChanges;

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isBusy || isDeleting) return;

    const succeeded = await runEdit({
      instruction: instruction.trim(),
      selectedGeneratedImageIds: Array.from(selectedGeneratedIds),
      selectedReferenceIndices: Array.from(selectedReferenceIndices),
      ...currentSettings(),
    });
    if (succeeded) {
      setInstruction("");
      setSelectedGeneratedIds(new Set());
      setSelectedReferenceIndices(new Set());
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

  const materials = concept?.materials ?? [];
  // Projects from before the material concept existed (and any where GPT found nothing
  // worth pinning down) have no materials - they get no materials column.
  const showMaterials = materials.length > 0;
  const inReview = !project.conceptApproved;

  // The original photo for new projects; older projects mapped their materials on a render.
  const conceptReference = conceptReferenceIndex !== null ? uploadedImages.find((ref) => ref.index === conceptReferenceIndex) : undefined;
  const conceptGenerated =
    !conceptReference && concept?.conceptImageId ? images.find((img) => img.imageId === concept.conceptImageId) : undefined;
  const conceptSource: ConceptSource | null = conceptReference
    ? {
        src: imageUrl(conceptReference.url),
        thumbnailSrc: imageUrl(conceptReference.thumbnailUrl),
        alt: "Original photo",
        lightboxId: `reference-${conceptReference.index}`,
      }
    : conceptGenerated
      ? {
          src: imageUrl(conceptGenerated.url),
          thumbnailSrc: imageUrl(conceptGenerated.thumbnailUrl),
          alt: "Concept image",
          lightboxId: conceptGenerated.imageId,
        }
      : null;
  // An older project still in review rendered its concept into slot 0; its id is only known
  // once labelling returns, so until then slot 0 stands in.
  const legacyReviewImage = !conceptSource && inReview ? images.find((img) => img.index === 0) : undefined;
  const reviewSrc = conceptSource?.src ?? (legacyReviewImage ? imageUrl(legacyReviewImage.url) : null);
  const activeMaterialId = hoveredMaterialId ?? selectedMaterialId;

  const reviewStatus = !project.generatedPrompt
    ? "Reading your photo and choosing the main materials..."
    : isLabelling
      ? "Mapping the materials on your photo..."
      : null;
  const hasRenders = project.requestedImageCount > 0 || pendingNewImageCount > 0;

  return (
    <div
      className={[
        styles.page,
        showMaterials || inReview ? styles.withMaterials : "",
        photosHidden ? styles.photosHidden : "",
        materialsHidden ? styles.materialsHidden : "",
      ].join(" ")}
    >
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link to="/" className={styles.backIconLink} aria-label="Back to projects" title="Back to projects">
            <BackArrowIcon />
          </Link>
          <div className={styles.titleBlock}>
            <ProjectTitle title={project.title} fallback={project.location} onRename={handleRename} />
            <div className={styles.summary}>
              {project.model.displayName} · {project.imageSize} · {project.aspectRatio} · {project.timeOfDay} · {project.weather}
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.panelToggle} ${photosHidden ? styles.panelToggleOff : ""}`}
              onClick={() => setPhotosHidden(!photosHidden)}
              aria-pressed={!photosHidden}
              title={photosHidden ? "Show photos" : "Hide photos"}
            >
              <PanelLeftIcon />
            </button>
            {(showMaterials || inReview) && (
              <button
                type="button"
                className={`${styles.panelToggle} ${materialsHidden ? styles.panelToggleOff : ""}`}
                onClick={() => setMaterialsHidden(!materialsHidden)}
                aria-pressed={!materialsHidden}
                title={materialsHidden ? "Show materials" : "Hide materials"}
              >
                <PanelRightIcon />
              </button>
            )}
            <UsageRing />
            <AccountMenu />
          </div>
        </div>
        {renameError && <ErrorBanner error={renameError} onDismiss={() => setRenameError(null)} />}
      </header>

      <div className={styles.workspace}>
        <aside className={styles.photos} aria-label="Your photos">
          <h2 className={styles.columnHeading}>Photos</h2>
          <div className={styles.photoList}>
            {uploadedImages.map((ref) => {
              const isOriginal = ref.index === conceptReferenceIndex;
              const isAdded = originalReferenceCount.current !== null && ref.index >= originalReferenceCount.current;
              return (
                <ProjectImageTile
                  key={`reference-${ref.index}`}
                  status="loaded"
                  src={imageUrl(ref.thumbnailUrl)}
                  label={`Photo ${ref.index + 1}`}
                  badge={isOriginal ? "Original" : isAdded ? "Added" : undefined}
                  badgeAccent={isOriginal}
                  isChecked={selectedReferenceIndices.has(ref.index)}
                  onToggleCheck={inReview ? undefined : () => toggleReferenceSelection(ref.index)}
                  onClick={() => openLightbox(`reference-${ref.index}`)}
                />
              );
            })}
            {!inReview && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={handleFilesSelected}
                />
                <button
                  type="button"
                  className={styles.addPhoto}
                  onClick={handleAddPhotoClick}
                  disabled={isUploadingImage || isDeleting}
                  title="Add photos - each is rendered right away with your current settings"
                >
                  {isUploadingImage ? <Spinner /> : "+ Add photo"}
                </button>
              </>
            )}
          </div>
          {!inReview && (
            <p className={styles.columnHint}>Added photos are selected for you - press Generate to render them. Select any photo to render it again.</p>
          )}
          {uploadError && <ErrorBanner error={uploadError} onDismiss={() => setUploadError(null)} />}
        </aside>

        <main className={styles.main}>
          {inReview ? (
            <section className={styles.stage} aria-label="Your photo">
              {reviewSrc ? (
                <div className={styles.stageImage}>
                  <MaterialOverlay
                    src={reviewSrc}
                    alt={conceptSource?.alt ?? "Concept image"}
                    materials={materials}
                    activeId={activeMaterialId}
                    selectedId={selectedMaterialId}
                    onHover={setHoveredMaterialId}
                    onSelect={setSelectedMaterialId}
                    dotStyle={dotStyle}
                    maxHeight="var(--review-image-max-height)"
                  />
                  {reviewStatus && (
                    <div className={styles.stageBusy}>
                      <Spinner />
                      <span>{reviewStatus}</span>
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
                Nothing is rendered yet. Agree the materials on your photo first - hover or click one to see where it goes. You choose
                how many images to generate after you approve.
              </p>
            </section>
          ) : hasRenders ? (
            <div className={styles.grid}>
              {Array.from({ length: project.requestedImageCount }, (_, index) => {
                const image = images.find((img) => img.index === index);
                if (image) {
                  return (
                    <ProjectImageTile
                      key={`generated-${index}`}
                      status="loaded"
                      src={imageUrl(image.thumbnailUrl)}
                      label={generatedLabel(image)}
                      badge={typeof image.sourceReferenceIndex === "number" ? `Photo ${image.sourceReferenceIndex + 1}` : undefined}
                      isChecked={selectedGeneratedIds.has(image.imageId)}
                      onToggleCheck={() => toggleGeneratedSelection(image.imageId)}
                      isRefining={refiningImageIds.has(image.imageId)}
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
          ) : (
            <div className={styles.emptyRenders}>
              <p>No renders yet.</p>
              {originalPhoto && (
                <button type="button" className={styles.sendButton} onClick={() => setIsGenerateOpen(true)}>
                  Generate from your photo
                </button>
              )}
            </div>
          )}

          {generatingIndices.size === 0 && !inReview && (
            <form className={styles.refineBar} onSubmit={handleEdit}>
              <div className={styles.refineTarget}>
                {hasSelection
                  ? selectedReferenceIndices.size > 0
                    ? `Generating ${editImageCount} new image(s) from the selected photo(s) · Press Delete to remove`
                    : `Editing ${selectedGeneratedIds.size} selected image(s) · Press Delete to remove`
                  : `Generating ${editImageCount} new image(s) from your prompt and settings · Select renders to edit them, or photos to render them`}
              </div>
              <div className={styles.refineInputRow}>
                <input
                  ref={instructionRef}
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={
                    !hasSelection
                      ? "Describe the new images, or leave empty for more of the same..."
                      : selectedReferenceIndices.size > 0
                        ? "Optional: describe what to change..."
                        : "Describe the edit to the selected images..."
                  }
                  maxLength={MAX_INSTRUCTION_LENGTH}
                  disabled={isBusy || isDeleting}
                  className={styles.refineInput}
                />

                <Dropdown trigger={<HamburgerIcon />} align="right" disabled={isBusy || isDeleting}>
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
                    <AspectRatioPicker
                      ratios={catalog.supportedAspectRatios}
                      selected={editAspectRatio}
                      onSelect={chooseAspectRatio}
                      imageRatio={imageRatio}
                    />
                  </div>
                </Dropdown>

                <div className={styles.lockedDropdown} title="Aspect ratio of the next images">
                  <AspectRatioIcon ratio={resolvedAspectRatio} />
                  {editAspectRatio === AS_IMAGE ? `As image · ${resolvedAspectRatio}` : resolvedAspectRatio}
                </div>

                <Dropdown
                  trigger={
                    <span className={styles.modelTrigger}>
                      {catalog.models.find((m) => m.key === editModelKey)?.displayName ?? "Model"}
                      <ChevronUpDownIcon />
                    </span>
                  }
                  align="right"
                  disabled={isBusy || isDeleting}
                >
                  <ModelPicker
                    models={catalog.models}
                    selectedKey={editModelKey}
                    onSelectKey={handleSelectModel}
                    selectedImageSize={editImageSize}
                    onSelectImageSize={setEditImageSize}
                    disabled={isBusy || isDeleting}
                  />
                </Dropdown>

                <button type="submit" className={styles.sendButton} disabled={!canSubmit || isBusy || isDeleting}>
                  {isBusy ? <Spinner /> : willUseGpt ? "Generate" : "Send"}
                </button>
              </div>
              {editError && <ErrorBanner error={editError} onDismiss={() => setEditError(null)} />}
              {deleteError && <ErrorBanner error={deleteError} onDismiss={() => setDeleteError(null)} />}
            </form>
          )}
        </main>

        {showMaterials && concept ? (
          <div className={styles.side}>
            <MaterialsPanel
              concept={concept}
              conceptImageSrc={!inReview && conceptSource ? conceptSource.src : null}
              conceptImageAlt={conceptSource?.alt ?? "Concept image"}
              isLabelling={isLabelling}
              hoveredId={hoveredMaterialId}
              selectedId={selectedMaterialId}
              onHover={setHoveredMaterialId}
              onSelect={setSelectedMaterialId}
              onRename={handleRenameMaterial}
              onAdd={handleAddMaterial}
              onDelete={handleDeleteMaterial}
              dotStyle={dotStyle}
              onDotStyleChange={changeDotStyle}
              onEditAreas={
                concept.conceptLabelled && conceptSource && !isLabelling
                  ? () => {
                      setHoveredMaterialId(null);
                      setAreaEditor({ materialId: selectedMaterialId, drawing: false });
                    }
                  : undefined
              }
              onOpenConceptImage={conceptSource ? () => openLightbox(conceptSource.lightboxId) : undefined}
              review={
                inReview
                  ? {
                      canApprove: Boolean(project.generatedPrompt) && reviewSrc !== null && !isLabelling && generatingIndices.size === 0,
                      isBusy: isApproving || isRetryingConcept,
                      onApprove: () => void handleApprove(),
                      onRetry: () => void handleRetryConcept(),
                    }
                  : undefined
              }
            />
            {conceptError && <ErrorBanner error={conceptError} onDismiss={() => setConceptError(null)} />}
          </div>
        ) : (
          inReview && (
            <div className={styles.side}>
              <div className={styles.sidePlaceholder}>
                <Spinner />
                <span>Choosing the main materials...</span>
              </div>
            </div>
          )
        )}
      </div>

      {areaEditor && concept && conceptSource && (
        <MaterialAreaEditor
          imageSrc={conceptSource.src}
          imageAlt={conceptSource.alt}
          materials={concept.materials}
          dotStyle={dotStyle}
          initialMaterialId={areaEditor.materialId}
          initialDrawing={areaEditor.drawing}
          onSave={handleSaveAreas}
          onClose={() => setAreaEditor(null)}
        />
      )}

      {isGenerateOpen && originalPhoto && (
        <GenerateFromPhotoDialog
          photoSrc={imageUrl(originalPhoto.thumbnailUrl)}
          models={catalog.models}
          maxImages={catalog.maxGeneratedImages}
          aspectRatios={catalog.supportedAspectRatios}
          imageRatio={photoRatios[originalPhoto.index] ?? null}
          initial={{
            imageCount: editImageCount,
            modelKey: editModelKey,
            imageSize: editImageSize,
            aspectRatio: editAspectRatio,
            timeOfDay: editTimeOfDay,
            weather: editWeather,
            location: editLocation,
          }}
          onConfirm={handleGenerateFromPhoto}
          onCancel={() => setIsGenerateOpen(false)}
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

function generatedLabel(image: GeneratedImageDto): string {
  return typeof image.sourceReferenceIndex === "number"
    ? `Generated image ${image.index + 1} · from photo ${image.sourceReferenceIndex + 1}`
    : `Generated image ${image.index + 1}`;
}
