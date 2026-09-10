import { useMemo, useState } from "react";
import type { ImageModelsResponse, StartChatParams, TimeOfDay, WeatherCondition } from "../api/chatTypes";
import { TIME_OF_DAY_OPTIONS, WEATHER_OPTIONS } from "../constants";
import { AspectRatioPicker } from "./AspectRatioPicker";
import { Dropdown } from "./Dropdown";
import { ChevronUpDownIcon, HamburgerIcon, SendArrowIcon } from "./icons";
import { ImageUploader } from "./ImageUploader";
import { ModelPicker } from "./ModelPicker";
import { Spinner } from "./Spinner";
import styles from "./ChatComposer.module.css";

interface ChatComposerProps {
  catalog: ImageModelsResponse;
  onSubmit: (params: StartChatParams) => void;
  isSubmitting: boolean;
}

/**
 * The home page's "start a new chat" input: a photo uploader, a single text field for the
 * location/scene, and two dropdowns (model, settings) next to the send button - submitting
 * immediately (without ever opening an existing chat card) starts a brand new chat.
 */
export function ChatComposer({ catalog, onSubmit, isSubmitting }: ChatComposerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [location, setLocation] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("GoldenHour");
  const [weather, setWeather] = useState<WeatherCondition>("Clear");
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

  const imageCountOptions = useMemo(
    () => Array.from({ length: catalog.maxGeneratedImages }, (_, i) => i + 1),
    [catalog.maxGeneratedImages],
  );

  const trimmedLocation = location.trim();
  const isValid = files.length > 0 && trimmedLocation.length > 0;

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
    <form className={styles.composer} onSubmit={handleSubmit}>
      <ImageUploader
        files={files}
        onChange={setFiles}
        maxFiles={selectedModel?.maxReferenceImages ?? 5}
        disabled={isSubmitting}
      />

      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.locationInput}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Where is this? e.g. Brazzaville, Republic of the Congo"
          maxLength={200}
          disabled={isSubmitting}
        />

        <Dropdown trigger={<HamburgerIcon />} align="right" disabled={isSubmitting}>
          <label className={styles.settingField}>
            <span>Time of day</span>
            <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}>
              {TIME_OF_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.settingField}>
            <span>Weather</span>
            <select value={weather} onChange={(e) => setWeather(e.target.value as WeatherCondition)}>
              {WEATHER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.settingField}>
            <span>Number of images</span>
            <select value={imageCount} onChange={(e) => setImageCount(Number(e.target.value))}>
              {imageCountOptions.map((n) => (
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
              selected={aspectRatio}
              onSelect={setAspectRatio}
              disabled={isSubmitting}
            />
          </div>
        </Dropdown>

        <button
          type="submit"
          className={styles.sendButton}
          disabled={!isValid || isSubmitting}
          aria-label="Generate"
        >
          {isSubmitting ? <Spinner /> : <SendArrowIcon />}
        </button>
      </div>

      <Dropdown
        trigger={
          <span className={styles.modelTrigger}>
            {selectedModel?.displayName ?? "Model"}
            <ChevronUpDownIcon />
          </span>
        }
        disabled={isSubmitting}
      >
        <ModelPicker
          models={catalog.models}
          selectedKey={modelKey}
          onSelectKey={handleSelectModel}
          selectedImageSize={imageSize}
          onSelectImageSize={setImageSize}
          disabled={isSubmitting}
        />
      </Dropdown>
    </form>
  );
}
