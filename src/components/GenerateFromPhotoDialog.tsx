import { useEffect, useState } from "react";
import type { ImageModelDto, TimeOfDay, WeatherCondition } from "../api/projectTypes";
import { TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import { AspectRatioPicker } from "./AspectRatioPicker";
import { ModelPicker } from "./ModelPicker";
import styles from "./GenerateFromPhotoDialog.module.css";

/** Everything a render request carries besides the photo and instruction - the project's current settings. */
export interface GenerateSettings {
  imageCount: number;
  modelKey: string;
  imageSize: string;
  /** A ratio, or AS_IMAGE - the page resolves it against the photo. */
  aspectRatio: string;
  timeOfDay: TimeOfDay;
  weather: WeatherCondition;
  location: string;
}

interface GenerateFromPhotoDialogProps {
  /** Small preview of the photo about to be rendered, already absolute. */
  photoSrc: string;
  models: ImageModelDto[];
  maxImages: number;
  aspectRatios: string[];
  /** The photo's matching ratio for the "As image" option; null while it is being measured. */
  imageRatio: string | null;
  /** The project's current settings - what the user picked when creating it, or last rendered with. */
  initial: GenerateSettings;
  onConfirm: (settings: GenerateSettings) => void;
  onCancel: () => void;
}

/**
 * Asked once the materials are approved: render the original photo now, with the user's
 * own settings - all adjustable first. Nothing is spent until they confirm; "Not now" leaves
 * the project ready to render later.
 */
export function GenerateFromPhotoDialog({
  photoSrc,
  models,
  maxImages,
  aspectRatios,
  imageRatio,
  initial,
  onConfirm,
  onCancel,
}: GenerateFromPhotoDialogProps) {
  const [settings, setSettings] = useState<GenerateSettings>(initial);
  const set = <K extends keyof GenerateSettings>(key: K, value: GenerateSettings[K]) => setSettings((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSelectModel = (key: string) => {
    const model = models.find((m) => m.key === key);
    setSettings((prev) => ({
      ...prev,
      modelKey: key,
      imageSize: model && !model.supportedImageSizes.includes(prev.imageSize) ? model.defaultImageSize : prev.imageSize,
    }));
  };

  const { imageCount } = settings;
  const modelName = models.find((m) => m.key === settings.modelKey)?.displayName ?? settings.modelKey;
  const canConfirm = settings.location.trim().length > 0;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="generate-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.heading}>
          <img src={photoSrc} alt="Your photo" className={styles.photo} />
          <div>
            <h2 id="generate-title" className={styles.title}>
              Generate from your photo?
            </h2>
            <p className={styles.lead}>
              Materials approved. {imageCount} {imageCount === 1 ? "render" : "renders"} of your photo with {modelName} at{" "}
              {settings.imageSize}, using them.
            </p>
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span>Number of images</span>
            <select value={imageCount} onChange={(e) => set("imageCount", Number(e.target.value))}>
              {Array.from({ length: maxImages }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Time of day</span>
            <select value={settings.timeOfDay} onChange={(e) => set("timeOfDay", e.target.value as TimeOfDay)}>
              {TIME_OF_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Weather</span>
            <select value={settings.weather} onChange={(e) => set("weather", e.target.value as WeatherCondition)}>
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={styles.field}>
          <span>Location</span>
          <input type="text" value={settings.location} maxLength={200} onChange={(e) => set("location", e.target.value)} />
        </label>

        <div className={styles.field}>
          <span>Aspect ratio</span>
          <AspectRatioPicker
            ratios={aspectRatios}
            selected={settings.aspectRatio}
            onSelect={(ratio) => set("aspectRatio", ratio)}
            imageRatio={imageRatio}
          />
        </div>

        <div className={styles.field}>
          <span>Model and size</span>
          <ModelPicker
            models={models}
            selectedKey={settings.modelKey}
            onSelectKey={handleSelectModel}
            selectedImageSize={settings.imageSize}
            onSelectImageSize={(size) => set("imageSize", size)}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Not now
          </button>
          <button type="button" className={styles.confirmButton} onClick={() => onConfirm(settings)} disabled={!canConfirm}>
            Generate {imageCount} {imageCount === 1 ? "image" : "images"}
          </button>
        </div>
      </div>
    </div>
  );
}
