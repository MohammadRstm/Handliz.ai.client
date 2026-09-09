import { useMemo, useState } from "react";
import type { GenerateImagesParams, ImageModelsResponse, TimeOfDay, WeatherCondition } from "../api/types";
import { TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import { ImageUploader } from "./ImageUploader";
import { ModelPicker } from "./ModelPicker";
import { Spinner } from "./Spinner";
import styles from "./GenerationForm.module.css";

interface GenerationFormProps {
  catalog: ImageModelsResponse;
  onSubmit: (params: GenerateImagesParams) => void;
  isSubmitting: boolean;
}

export function GenerationForm({ catalog, onSubmit, isSubmitting }: GenerationFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("GoldenHour");
  const [weather, setWeather] = useState<WeatherCondition>("Clear");
  const [location, setLocation] = useState("");
  const [imageCount, setImageCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState(
    catalog.supportedAspectRatios.includes("16:9") ? "16:9" : catalog.supportedAspectRatios[0],
  );
  const [modelKey, setModelKey] = useState(catalog.defaultModelKey);

  const selectedModel = catalog.models.find((m) => m.key === modelKey) ?? catalog.models[0];
  const [imageSize, setImageSize] = useState(selectedModel?.defaultImageSize ?? "");

  const handleSelectModel = (key: string) => {
    setModelKey(key);
    const model = catalog.models.find((m) => m.key === key);
    if (model) {
      setImageSize(model.defaultImageSize);
      if (files.length > model.maxReferenceImages) {
        setFiles(files.slice(0, model.maxReferenceImages));
      }
    }
  };

  const trimmedLocation = location.trim();
  const isValid = files.length > 0 && trimmedLocation.length > 0 && imageCount >= 1;

  const imageCountOptions = useMemo(
    () => Array.from({ length: catalog.maxGeneratedImages }, (_, i) => i + 1),
    [catalog.maxGeneratedImages],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({
      images: files,
      timeOfDay,
      weather,
      location: trimmedLocation,
      imageCount,
      aspectRatio,
      modelKey,
      imageSize,
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reference photos</h2>
        <ImageUploader
          files={files}
          onChange={setFiles}
          maxFiles={selectedModel?.maxReferenceImages ?? 5}
          disabled={isSubmitting}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scene</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Time of day</span>
            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
              disabled={isSubmitting}
            >
              {TIME_OF_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Weather</span>
            <select
              value={weather}
              onChange={(e) => setWeather(e.target.value as WeatherCondition)}
              disabled={isSubmitting}
            >
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Location</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Brazzaville, Republic of the Congo"
              maxLength={200}
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Number of images</span>
            <select
              value={imageCount}
              onChange={(e) => setImageCount(Number(e.target.value))}
              disabled={isSubmitting}
            >
              {imageCountOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Aspect ratio</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={isSubmitting}
            >
              {catalog.supportedAspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Image model</h2>
        <ModelPicker
          models={catalog.models}
          selectedKey={modelKey}
          onSelectKey={handleSelectModel}
          selectedImageSize={imageSize}
          onSelectImageSize={setImageSize}
          disabled={isSubmitting}
        />
      </section>

      <button type="submit" className={styles.submitButton} disabled={!isValid || isSubmitting}>
        {isSubmitting ? <Spinner label="Generating..." /> : "Generate images"}
      </button>
    </form>
  );
}
