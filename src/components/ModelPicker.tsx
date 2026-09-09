import type { ImageModelDto } from "../api/types";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  models: ImageModelDto[];
  selectedKey: string;
  onSelectKey: (key: string) => void;
  selectedImageSize: string;
  onSelectImageSize: (size: string) => void;
  disabled?: boolean;
}

/** Renders the model catalog exactly in the order the API returned it - strongest first. */
export function ModelPicker({
  models,
  selectedKey,
  onSelectKey,
  selectedImageSize,
  onSelectImageSize,
  disabled,
}: ModelPickerProps) {
  const selectedModel = models.find((m) => m.key === selectedKey);

  return (
    <div className={styles.wrapper}>
      <div className={styles.cardList}>
        {models.map((model) => {
          const isSelected = model.key === selectedKey;
          return (
            <button
              key={model.key}
              type="button"
              className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
              onClick={() => onSelectKey(model.key)}
              disabled={disabled}
            >
              <span className={styles.cardHeader}>
                <span className={styles.cardName}>{model.displayName}</span>
                {isSelected && <span className={styles.badge}>Selected</span>}
              </span>
              <span className={styles.cardDescription}>{model.description}</span>
              <span className={styles.cardMeta}>
                Up to {model.maxReferenceImages} reference photo{model.maxReferenceImages === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedModel && selectedModel.supportedImageSizes.length > 1 && (
        <label className={styles.sizeRow}>
          <span className={styles.sizeLabel}>Output resolution</span>
          <select
            value={selectedImageSize}
            onChange={(e) => onSelectImageSize(e.target.value)}
            disabled={disabled}
            className={styles.sizeSelect}
          >
            {selectedModel.supportedImageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
