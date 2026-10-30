import { useEffect, useState } from "react";
import type { ImageModelDto } from "../api/projectTypes";
import { ErrorBanner } from "./ErrorBanner";
import { ModelPicker } from "./ModelPicker";
import { Spinner } from "./Spinner";
import styles from "./ApproveConceptDialog.module.css";

export interface ApproveSettings {
  imageCount: number;
  modelKey: string;
  imageSize: string;
}

interface ApproveConceptDialogProps {
  models: ImageModelDto[];
  maxImages: number;
  /** The project's current settings - what the user picked when creating it. */
  initial: ApproveSettings;
  /** Shown for reference; they're baked into the prompt, so changing them here isn't offered. */
  scene: { aspectRatio: string; timeOfDay: string; weather: string; location: string };
  isSubmitting: boolean;
  /** Shown in the dialog, which stays open so the user can retry or back out. */
  error?: Error | null;
  onConfirm: (settings: ApproveSettings) => void;
  onCancel: () => void;
}

/**
 * The step between approving the materials and spending credits on the batch: shows what
 * is about to be generated, with the user's own settings, and lets them adjust the count,
 * model and size first.
 */
export function ApproveConceptDialog({
  models,
  maxImages,
  initial,
  scene,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: ApproveConceptDialogProps) {
  const [imageCount, setImageCount] = useState(initial.imageCount);
  const [modelKey, setModelKey] = useState(initial.modelKey);
  const [imageSize, setImageSize] = useState(initial.imageSize);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onCancel]);

  const handleSelectModel = (key: string) => {
    setModelKey(key);
    const model = models.find((m) => m.key === key);
    if (model && !model.supportedImageSizes.includes(imageSize)) setImageSize(model.defaultImageSize);
  };

  const modelName = models.find((m) => m.key === modelKey)?.displayName ?? modelKey;

  return (
    <div className={styles.backdrop} onClick={() => !isSubmitting && onCancel()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="approve-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="approve-title" className={styles.title}>
          Generate your images?
        </h2>
        <p className={styles.lead}>
          {imageCount} {imageCount === 1 ? "image" : "images"} with {modelName} at {imageSize}, using the approved materials.
        </p>

        <label className={styles.field}>
          <span>Number of images</span>
          <select value={imageCount} onChange={(e) => setImageCount(Number(e.target.value))} disabled={isSubmitting}>
            {Array.from({ length: maxImages }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field}>
          <span>Model and size</span>
          <ModelPicker
            models={models}
            selectedKey={modelKey}
            onSelectKey={handleSelectModel}
            selectedImageSize={imageSize}
            onSelectImageSize={setImageSize}
            disabled={isSubmitting}
          />
        </div>

        <dl className={styles.scene}>
          <div>
            <dt>Aspect ratio</dt>
            <dd>{scene.aspectRatio}</dd>
          </div>
          <div>
            <dt>Time of day</dt>
            <dd>{scene.timeOfDay}</dd>
          </div>
          <div>
            <dt>Weather</dt>
            <dd>{scene.weather}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{scene.location}</dd>
          </div>
        </dl>

        {error && <ErrorBanner error={error} />}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={isSubmitting}>
            Not yet
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={() => onConfirm({ imageCount, modelKey, imageSize })}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : `Generate ${imageCount} ${imageCount === 1 ? "image" : "images"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
