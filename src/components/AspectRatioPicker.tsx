import { AS_IMAGE } from "../aspectRatio";
import styles from "./AspectRatioPicker.module.css";

interface AspectRatioPickerProps {
  ratios: string[];
  /** A ratio, or AS_IMAGE. */
  selected: string;
  onSelect: (ratio: string) => void;
  disabled?: boolean;
  /**
   * Offers "As image" first - the ratio of the photo being rendered - when present. The
   * photo's matching ratio, once measured, is shown with it; null while unknown.
   */
  imageRatio?: string | null;
}

/** A small rectangle icon proportioned to the ratio itself, e.g. "16:9" draws a wide thin rectangle. */
export function AspectRatioIcon({ ratio }: { ratio: string }) {
  const [wStr, hStr] = ratio.split(":");
  const w = Number(wStr) || 1;
  const h = Number(hStr) || 1;
  const maxDim = 18;
  const scale = maxDim / Math.max(w, h);
  const boxWidth = Math.max(w * scale, 4);
  const boxHeight = Math.max(h * scale, 4);

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x={(24 - boxWidth) / 2}
        y={(24 - boxHeight) / 2}
        width={boxWidth}
        height={boxHeight}
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function AspectRatioPicker({ ratios, selected, onSelect, disabled, imageRatio }: AspectRatioPickerProps) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="Aspect ratio">
      {imageRatio !== undefined && (
        <button
          type="button"
          role="radio"
          aria-checked={selected === AS_IMAGE}
          className={`${styles.option} ${styles.asImage} ${selected === AS_IMAGE ? styles.optionSelected : ""}`}
          onClick={() => onSelect(AS_IMAGE)}
          disabled={disabled}
          title="Render at the photo's own aspect ratio"
        >
          <AspectRatioIcon ratio={imageRatio ?? "4:3"} />
          <span>As image{imageRatio ? ` (${imageRatio})` : ""}</span>
        </button>
      )}
      {ratios.map((ratio) => (
        <button
          key={ratio}
          type="button"
          role="radio"
          aria-checked={ratio === selected}
          className={`${styles.option} ${ratio === selected ? styles.optionSelected : ""}`}
          onClick={() => onSelect(ratio)}
          disabled={disabled}
        >
          <AspectRatioIcon ratio={ratio} />
          <span>{ratio}</span>
        </button>
      ))}
    </div>
  );
}
