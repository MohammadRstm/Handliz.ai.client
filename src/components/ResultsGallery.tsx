import { useState } from "react";
import type { GenerateImagesResponse } from "../api/types";
import styles from "./ResultsGallery.module.css";

export interface DisplayedImage {
  imageId: string;
  index: number;
  mimeType: string;
  dataUrl: string;
}

interface ResultsGalleryProps {
  response: GenerateImagesResponse;
  images: DisplayedImage[];
  selectedImageId: string | null;
  onSelectImage: (imageId: string) => void;
  onStartOver: () => void;
}

export function ResultsGallery({ response, images, selectedImageId, onSelectImage, onStartOver }: ResultsGalleryProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {images.length} of {response.requestedCount} image{response.requestedCount === 1 ? "" : "s"} generated
          </h2>
          <p className={styles.subtitle}>
            {response.model.displayName} · {response.imageSize} · click an image to refine it through chat
          </p>
        </div>
        <button type="button" className={styles.startOverButton} onClick={onStartOver}>
          Start over
        </button>
      </div>

      {response.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {response.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className={styles.grid}>
        {images.map((image) => (
          <button
            key={image.imageId}
            type="button"
            className={`${styles.tile} ${selectedImageId === image.imageId ? styles.tileSelected : ""}`}
            onClick={() => onSelectImage(image.imageId)}
          >
            <img src={image.dataUrl} alt={`Generated ${image.index + 1}`} className={styles.tileImg} />
            <span className={styles.tileLabel}>Image {image.index + 1} · Refine</span>
          </button>
        ))}
      </div>

      {response.generatedPrompt && (
        <div className={styles.promptBox}>
          <button type="button" className={styles.promptToggle} onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "Hide" : "Show"} generated prompt (debug)
          </button>
          {showPrompt && <p className={styles.promptText}>{response.generatedPrompt}</p>}
        </div>
      )}
    </div>
  );
}
