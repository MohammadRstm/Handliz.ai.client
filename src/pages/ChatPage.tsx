import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as chatsApi from "../api/chatsApi";
import { ApiError } from "../api/client";
import type {
  ChatDetailResponse,
  GeneratedImageDto,
  ImageModelsResponse,
  TimeOfDay,
  UploadedReferenceImageDto,
  WeatherCondition,
} from "../api/chatTypes";
import { useAuth } from "../auth/useAuth";
import { AspectRatioIcon, AspectRatioPicker } from "../components/AspectRatioPicker";
import { ChatImageTile } from "../components/ChatImageTile";
import { Dropdown } from "../components/Dropdown";
import { ErrorBanner } from "../components/ErrorBanner";
import { AttachIcon, BackArrowIcon, ChevronUpDownIcon, HamburgerIcon } from "../components/icons";
import { Lightbox, type LightboxItem } from "../components/Lightbox";
import { ModelPicker } from "../components/ModelPicker";
import { Spinner } from "../components/Spinner";
import { MAX_INSTRUCTION_LENGTH, TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import styles from "./ChatPage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

export function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { accessToken } = useAuth();

  const [chat, setChat] = useState<ChatDetailResponse | null>(null);
  const [catalog, setCatalog] = useState<ImageModelsResponse | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [images, setImages] = useState<GeneratedImageDto[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedReferenceImageDto[]>([]);
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

  // The images the chat originally started with never carry the "Added" badge - only
  // images uploaded later, in-chat, do (Chunk 5). Captured once, at load.
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
  // existing tiles in place (their ids tracked here so ChatImageTile can overlay a
  // spinner on top of the still-visible image), while the GPT branch produces brand-new
  // images with no ids yet - pendingNewImageCount reserves that many loading placeholder
  // tiles until the real ones arrive. Exactly one of the two is ever non-empty per request.
  const [refiningImageIds, setRefiningImageIds] = useState<Set<string>>(new Set());
  const [pendingNewImageCount, setPendingNewImageCount] = useState(0);

  // In-chat editable generation parameters (Chunk 9) - seeded from the chat's current
  // values once it loads, then editable via the settings dropdown. Sent with every edit
  // request; the backend both applies them to that request and persists them as the
  // chat's new current values for subsequent ones.
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

  const imagesKickedOffForChatId = useRef<string | null>(null);
  const promptKickedOffForChatId = useRef<string | null>(null);
  const titleKickedOffForChatId = useRef<string | null>(null);

  const generateIndex = useCallback(
    (targetChatId: string, index: number) => {
      if (!accessToken) return;
      setFailedIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setGeneratingIndices((prev) => new Set(prev).add(index));

      chatsApi
        .generateChatImage(targetChatId, index, accessToken)
        .then((dto) => {
          setImages((prev) => [...prev.filter((img) => img.index !== index), dto].sort((a, b) => a.index - b.index));
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
    [accessToken],
  );

  const kickOffMissingImages = useCallback(
    (targetChatId: string, requestedImageCount: number, presentIndices: Set<number>) => {
      if (imagesKickedOffForChatId.current === targetChatId) return;
      imagesKickedOffForChatId.current = targetChatId;
      for (let i = 0; i < requestedImageCount; i++) {
        if (!presentIndices.has(i)) {
          generateIndex(targetChatId, i);
        }
      }
    },
    [generateIndex],
  );

  // Load the chat, then:
  //  - if it has no title yet, fetch one (fast, text-only) - independent of everything
  //    else, so it typically appears well before the images do.
  //  - if it has no prompt yet, fetch one (Stage 1, slower - analyzes the reference
  //    photos) and only THEN kick off image generation for missing slots, since Gemini
  //    needs that prompt. If the prompt is already present (a chat opened before, or
  //    reopened after a previous attempt), skip straight to image generation.
  // Each step is guarded by its own ref so React StrictMode's double-invoke (or a
  // re-render) never fires the same chat's title/prompt/images more than once.
  useEffect(() => {
    if (!chatId || !accessToken) return;
    let cancelled = false;

    Promise.all([chatsApi.getChat(chatId, accessToken), chatsApi.getImageModels(accessToken)])
      .then(([response, models]) => {
        if (cancelled) return;
        setChat(response);
        setCatalog(models);
        setImages(response.images);
        setUploadedImages(response.referenceImages);
        originalReferenceCount.current = response.referenceImages.length;

        setEditTimeOfDay(response.timeOfDay as TimeOfDay);
        setEditWeather(response.weather as WeatherCondition);
        setEditLocation(response.location);
        setEditAspectRatio(response.aspectRatio);
        setEditImageCount(Math.min(response.requestedImageCount || 1, models.maxGeneratedImages));
        setEditModelKey(response.model.key);
        setEditImageSize(response.imageSize);

        if (!response.title && titleKickedOffForChatId.current !== chatId) {
          titleKickedOffForChatId.current = chatId;
          chatsApi
            .generateChatTitle(chatId, accessToken)
            .then((titleResponse) => {
              if (cancelled) return;
              setChat((prev) => (prev ? { ...prev, title: titleResponse.title } : prev));
            })
            .catch(() => {
              // Non-critical: the location keeps serving as the displayed title.
            });
        }

        const presentIndices = new Set(response.images.map((img) => img.index));

        if (response.generatedPrompt) {
          kickOffMissingImages(chatId, response.requestedImageCount, presentIndices);
          return;
        }

        if (promptKickedOffForChatId.current === chatId) return;
        promptKickedOffForChatId.current = chatId;

        chatsApi
          .generateChatPrompt(chatId, accessToken)
          .then((promptResponse) => {
            if (cancelled) return;
            setChat((prev) => (prev ? { ...prev, generatedPrompt: promptResponse.generatedPrompt } : prev));
            kickOffMissingImages(chatId, response.requestedImageCount, presentIndices);
          })
          .catch((err) => {
            if (!cancelled) setLoadError(toError(err));
          });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toError(err));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, accessToken]);

  const lightboxItems: LightboxItem[] = useMemo(() => {
    const generatedItems: LightboxItem[] = images
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((img) => ({ id: img.imageId, dataUrl: img.dataUrl, label: `Generated image ${img.index + 1}` }));
    const referenceItems: LightboxItem[] = uploadedImages.map((ref) => ({
      id: `reference-${ref.index}`,
      dataUrl: ref.dataUrl,
      label: `Reference photo ${ref.index + 1}`,
    }));
    return [...generatedItems, ...referenceItems];
  }, [images, uploadedImages]);

  const handleSelectModel = (key: string) => {
    setEditModelKey(key);
    const model = catalog?.models.find((m) => m.key === key);
    if (model) setEditImageSize(model.defaultImageSize);
  };

  const handleDeleteSelected = useCallback(async () => {
    if (!chatId || !accessToken || isDeleting || isEditing) return;
    if (selectedGeneratedIds.size === 0 && selectedReferenceIndices.size === 0) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await chatsApi.deleteChatImages(chatId, Array.from(selectedGeneratedIds), Array.from(selectedReferenceIndices), accessToken);
      // Re-fetch rather than patch local state: deleting a generated image re-numbers
      // every remaining one server-side to close the gap (see DeleteChatImagesAsync), so
      // a simple local filter would leave stale indices that no longer match the server.
      const refreshed = await chatsApi.getChat(chatId, accessToken);
      setChat(refreshed);
      setImages(refreshed.images);
      setUploadedImages(refreshed.referenceImages);
      setSelectedGeneratedIds(new Set());
      setSelectedReferenceIndices(new Set());
    } catch (err) {
      setDeleteError(toError(err));
    } finally {
      setIsDeleting(false);
    }
  }, [chatId, accessToken, isDeleting, isEditing, selectedGeneratedIds, selectedReferenceIndices]);

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

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file || !chatId || !accessToken || isDeleting) return;

    setIsUploadingImage(true);
    setUploadError(null);
    try {
      const response = await chatsApi.uploadReferenceImage(chatId, file, accessToken);
      setUploadedImages((prev) => [...prev, response.referenceImage]);
    } catch (err) {
      setUploadError(toError(err));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const hasSelection = selectedGeneratedIds.size > 0 || selectedReferenceIndices.size > 0;
  // Mirrors the backend's own branch decision (EditChatImagesAsync): any uploaded/source
  // image in the selection re-invokes the full GPT -> Gemini pipeline, which is a
  // meaningful action on its own - free text is only required for the Gemini-only refine
  // branch, which has no other action to take.
  const willUseGpt = selectedReferenceIndices.size > 0;
  // A parameter actually differing from the chat's current persisted value is itself a
  // request to update the photo, same as typing a change would be - mirrors the backend's
  // own hasParamChanges check in EditChatImagesAsync. ImageCount is deliberately excluded:
  // it only governs how many brand-new images the GPT branch produces, so changing it has
  // no effect on a Gemini-only refine and shouldn't unlock submitting with no instruction.
  const hasParamChanges = chat
    ? editTimeOfDay !== chat.timeOfDay ||
      editWeather !== chat.weather ||
      editLocation.trim() !== chat.location ||
      editAspectRatio !== chat.aspectRatio ||
      editModelKey !== chat.model.key ||
      editImageSize !== chat.imageSize
    : false;
  const canSubmit = instruction.trim().length > 0 || willUseGpt || hasParamChanges;

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatId || !accessToken || !canSubmit || isEditing || isDeleting) return;

    setIsEditing(true);
    setEditError(null);
    if (willUseGpt) {
      setPendingNewImageCount(editImageCount);
    } else {
      const targetIds = selectedGeneratedIds.size > 0 ? selectedGeneratedIds : new Set(images.map((img) => img.imageId));
      setRefiningImageIds(targetIds);
    }
    try {
      const response = await chatsApi.editImages(
        chatId,
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
      setChat((prev) =>
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
            ← Back to chats
          </Link>
        </div>
      </div>
    );
  }

  if (!chat || !catalog) {
    return (
      <div className={styles.loadingPage}>
        <Spinner label="Loading chat..." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backIconLink} aria-label="Back to chats" title="Back to chats">
          <BackArrowIcon />
        </Link>
        <h1 className={styles.title}>
          {chat.title ?? chat.location}
          {!chat.title && <span className={styles.titleLoading} aria-label="Generating title" />}
        </h1>
        <div className={styles.summary}>
          {chat.model.displayName} · {chat.imageSize} · {chat.aspectRatio} · {chat.timeOfDay} · {chat.weather}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {uploadedImages.map((ref) => (
            <ChatImageTile
              key={`reference-${ref.index}`}
              status="loaded"
              dataUrl={ref.dataUrl}
              label={`Reference photo ${ref.index + 1}`}
              isChecked={selectedReferenceIndices.has(ref.index)}
              onToggleCheck={() => toggleReferenceSelection(ref.index)}
              isNewlyAdded={originalReferenceCount.current !== null && ref.index >= originalReferenceCount.current}
              onClick={() => openLightbox(`reference-${ref.index}`)}
            />
          ))}

          {Array.from({ length: chat.requestedImageCount }, (_, index) => {
            const image = images.find((img) => img.index === index);
            if (image) {
              return (
                <ChatImageTile
                  key={`generated-${index}`}
                  status="loaded"
                  dataUrl={image.dataUrl}
                  label={`Generated image ${index + 1}`}
                  isChecked={selectedGeneratedIds.has(image.imageId)}
                  onToggleCheck={() => toggleGeneratedSelection(image.imageId)}
                  isRefining={refiningImageIds.has(image.imageId)}
                  onClick={() => openLightbox(image.imageId)}
                />
              );
            }
            if (failedIndices.has(index)) {
              return (
                <ChatImageTile
                  key={`generated-${index}`}
                  status="failed"
                  label={`Image ${index + 1}`}
                  onRetry={() => chatId && generateIndex(chatId, index)}
                />
              );
            }
            return <ChatImageTile key={`generated-${index}`} status="loading" label={`Image ${index + 1}`} />;
          })}

          {Array.from({ length: pendingNewImageCount }, (_, i) => (
            <ChatImageTile key={`pending-new-${i}`} status="loading" label="Generating new image..." />
          ))}
        </div>

        {generatingIndices.size === 0 && images.length > 0 && (
          <form className={styles.refineBar} onSubmit={handleEdit}>
            <div className={styles.refineTarget}>
              {hasSelection
                ? `Editing ${selectedGeneratedIds.size + selectedReferenceIndices.size} selected image(s) · Press Delete to remove`
                : "Editing all recently generated images"}
            </div>
            <div className={styles.refineInputRow}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelected} />
              <button
                type="button"
                className={styles.attachButton}
                onClick={handleAttachClick}
                disabled={isUploadingImage || isEditing || isDeleting}
                aria-label="Add another photo to this chat"
                title="Add another photo to this chat"
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
