import { useState } from "react";
import type { ProjectMaterialDto, ProjectMaterialsResponse } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import { MaterialOverlay, type DotStyle } from "./MaterialOverlay";
import { Spinner } from "./Spinner";
import styles from "./MaterialsPanel.module.css";

const MAX_NAME_LENGTH = 100;

interface MaterialsPanelProps {
  concept: ProjectMaterialsResponse;
  /**
   * Signed URL of the concept image for the small preview, already absolute - or null when
   * there is none yet, or while it is shown full size in the main column (the review step).
   */
  conceptImageSrc: string | null;
  /** With no concept image, decides whether the hint says "wait for the first image" or "pick one" (after the concept image was deleted). */
  hasGeneratedImages: boolean;
  isLabelling: boolean;
  /** Hover and selection are owned by the page, so this list and a full-size overlay stay in step. */
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (materialId: string | null) => void;
  onSelect: (materialId: string | null) => void;
  /** Resolves once the rename is saved; rejects to put the old name back. */
  onRename: (materialId: string, name: string) => Promise<void>;
  onOpenConceptImage?: () => void;
  /** How the dots are laid out - owned by the page so the full-size review image follows the same switch. */
  dotStyle: DotStyle;
  onDotStyleChange: (style: DotStyle) => void;
  /** Opens the area editor; omitted until the concept image is labelled. */
  onEditAreas?: () => void;
  /** Present only while the concept awaits approval: renders the Approve / Try again actions. */
  review?: {
    canApprove: boolean;
    isBusy: boolean;
    onApprove: () => void;
    onRetry: () => void;
  };
}

/**
 * The project's material concept, beside the grid: the concept image with each material
 * tinted over its surfaces, and the list of materials with their names editable as plain
 * text. A rename only changes future generations - the existing images, and the outlines on
 * the concept image, stay as they are.
 */
export function MaterialsPanel({
  concept,
  conceptImageSrc,
  hasGeneratedImages,
  isLabelling,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  onRename,
  onOpenConceptImage,
  dotStyle,
  onDotStyleChange,
  onEditAreas,
  review,
}: MaterialsPanelProps) {
  const [labelsHidden, setLabelsHidden] = useState(false);
  const activeId = hoveredId ?? selectedId;

  return (
    <aside className={styles.panel} aria-label="Materials">
      <div className={styles.header}>
        <h2 className={styles.heading}>{review ? "Review the materials" : "Materials"}</h2>
        {conceptImageSrc && concept.conceptLabelled && (
          <button type="button" className={styles.toggle} onClick={() => setLabelsHidden((v) => !v)} aria-pressed={labelsHidden}>
            {labelsHidden ? "Show labels" : "Hide labels"}
          </button>
        )}
      </div>

      {onEditAreas && (
        <button type="button" className={styles.editAreasButton} onClick={onEditAreas}>
          Edit areas
        </button>
      )}

      {concept.conceptLabelled && (
        <div className={styles.segmented} role="group" aria-label="Dot layout">
          {(["even", "random"] as const).map((style) => (
            <button
              key={style}
              type="button"
              className={`${styles.segment} ${dotStyle === style ? styles.segmentActive : ""}`}
              onClick={() => onDotStyleChange(style)}
              aria-pressed={dotStyle === style}
            >
              {style === "even" ? "Even dots" : "Random dots"}
            </button>
          ))}
        </div>
      )}

      {review && (
        <p className={styles.hint}>
          These are the main materials for the whole project. Rename any that aren't right, then approve to generate your images.
        </p>
      )}

      {conceptImageSrc ? (
        <div className={styles.preview}>
          <MaterialOverlay
            src={conceptImageSrc}
            alt="Concept image"
            materials={concept.materials}
            hidden={labelsHidden}
            activeId={activeId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
            dotStyle={dotStyle}
          />
          {onOpenConceptImage && (
            <button type="button" className={styles.expandButton} onClick={onOpenConceptImage} title="Open the concept image">
              Open
            </button>
          )}
          {isLabelling && (
            <div className={styles.labelling}>
              <Spinner />
              <span>Tracing materials...</span>
            </div>
          )}
        </div>
      ) : (
        !review && (
          <p className={styles.hint}>
            {hasGeneratedImages
              ? "Use “Set as concept” on an image to show where these materials are."
              : "The materials are shown on the first image once it's ready."}
          </p>
        )
      )}

      <ul className={styles.list}>
        {concept.materials.map((material) => (
          // Keyed by the saved name too, so a row restarts from the server's value whenever
          // it changes (a save, a reload) instead of syncing its draft in an effect.
          <MaterialRow
            key={`${material.id}:${material.name}`}
            material={material}
            isActive={activeId === material.id}
            isSelected={selectedId === material.id}
            showMissing={concept.conceptLabelled && !material.box}
            onRename={onRename}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {review ? (
        <div className={styles.actions}>
          <button type="button" className={styles.approveButton} onClick={review.onApprove} disabled={!review.canApprove || review.isBusy}>
            Approve materials
          </button>
          <button
            type="button"
            className={styles.retryButton}
            onClick={review.onRetry}
            disabled={review.isBusy}
            title="Render a new concept image and choose the materials again (uses credits)"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className={styles.footnote}>Renaming a material applies to images generated from now on.</p>
      )}
    </aside>
  );
}

interface MaterialRowProps {
  material: ProjectMaterialDto;
  isActive: boolean;
  isSelected: boolean;
  /** Labelling ran and didn't find this material on the concept image. */
  showMissing: boolean;
  onRename: (materialId: string, name: string) => Promise<void>;
  onHover: (materialId: string | null) => void;
  onSelect: (materialId: string | null) => void;
}

function MaterialRow({ material, isActive, isSelected, showMissing, onRename, onHover, onSelect }: MaterialRowProps) {
  const [draft, setDraft] = useState(material.name);
  const [isSaving, setIsSaving] = useState(false);

  const commit = async () => {
    const name = draft.trim();
    // An empty name would leave GPT a labelled region with nothing to apply - the API
    // rejects it too, so just put the last saved name back.
    if (!name || name === material.name) {
      setDraft(material.name);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(material.id, name);
    } catch {
      setDraft(material.name);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li
      className={`${styles.row} ${isActive ? styles.rowActive : ""} ${isSelected ? styles.rowSelected : ""}`}
      style={{ "--row-color": materialColor(material.label) } as React.CSSProperties}
      onMouseEnter={() => onHover(material.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        className={styles.chip}
        style={{ background: materialColor(material.label) }}
        onClick={() => onSelect(isSelected ? null : material.id)}
        aria-pressed={isSelected}
        title={isSelected ? "Unpin on the image" : "Pin on the image"}
      >
        {material.label}
      </button>
      <div className={styles.fields}>
        <input
          type="text"
          className={styles.nameInput}
          value={draft}
          maxLength={MAX_NAME_LENGTH}
          disabled={isSaving}
          aria-label={`${material.label} material`}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => onHover(material.id)}
          onBlur={() => {
            onHover(null);
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(material.name);
              // Blur after the reset lands, so commit sees the restored name and does nothing.
              const input = e.currentTarget;
              requestAnimationFrame(() => input.blur());
            }
          }}
        />
        <span className={styles.region}>
          {material.regionDescription}
          {showMissing && <span className={styles.missing}> · not in view</span>}
        </span>
      </div>
      {isSaving && <Spinner />}
    </li>
  );
}
