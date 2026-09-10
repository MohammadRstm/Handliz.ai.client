import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ImageUploader.module.css";

interface ImageUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles: number;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Multi-file drag-and-drop uploader. Thumbnails and the dropzone live in one flex-wrap
 * row (thumbnails first, dropzone last in DOM order) rather than stacked in separate
 * blocks: the dropzone grows to fill whatever space is left in the current row and
 * shrinks as more thumbnails are added, wrapping to a fresh full-width row of its own
 * once a row fills up - so adding more photos always continues the same sequence
 * instead of pushing a full-width dropzone down as a separate section.
 *
 * Client-side format/count checks are a convenience only - the backend re-validates
 * everything (magic bytes, size, count) and is the source of truth.
 */
export function ImageUploader({ files, onChange, maxFiles, disabled }: ImageUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are an external-resource concern, not derived UI state: compute them
  // during render and use the effect only to revoke the previous batch, rather than
  // setState-in-effect (which would trigger an extra, avoidable render).
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const accepted = Array.from(incoming).filter((f) => ACCEPTED_TYPES.includes(f.type));
      const combined = [...files, ...accepted].slice(0, maxFiles);
      onChange(combined);
    },
    [files, maxFiles, onChange],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (disabled) return;
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const atLimit = files.length >= maxFiles;

  return (
    <div className={styles.wrapper}>
      {previewUrls.map((url, index) => (
        <div key={url} className={styles.previewItem}>
          <img src={url} alt={`Reference ${index + 1}`} className={styles.previewImg} />
          <button
            type="button"
            className={styles.removeButton}
            onClick={() => removeAt(index)}
            disabled={disabled}
            aria-label={`Remove reference photo ${index + 1}`}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Always the same size/content (flex: 1, shrinking as thumbnails accumulate) -
          not a separate compact mode once files exist. That's what lets it wrap to a
          fresh row and re-expand to fill it, repeating the same shrink cycle there. */}
      <div
        className={[styles.dropzone, isDragActive ? styles.dropzoneActive : "", disabled ? styles.disabled : ""]
          .filter(Boolean)
          .join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !atLimit && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          hidden
          disabled={disabled || atLimit}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <p className={styles.hint}>
          {atLimit ? `Maximum of ${maxFiles} reference photo${maxFiles === 1 ? "" : "s"} reached` : "Drag photos here, or click to browse"}
        </p>
        {!atLimit && <p className={styles.hintSmall}>JPEG, PNG, or WebP · up to {maxFiles} photos</p>}
      </div>
    </div>
  );
}
