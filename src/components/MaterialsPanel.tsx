import { useState } from "react";
import type { ProjectMaterialDto, ProjectMaterialsResponse } from "../api/projectTypes";
import { MAX_MATERIALS, materialColor } from "./materialColor";
import { MaterialOverlay, type DotStyle } from "./MaterialOverlay";
import { Spinner } from "./Spinner";
import styles from "./MaterialsPanel.module.css";

const MAX_NAME_LENGTH = 100;

interface MaterialsPanelProps {
  concept: ProjectMaterialsResponse;
  /**
   * Signed URL of the image the materials are mapped on (the original photo) for the small
   * preview, already absolute - or null when there is none, or while it is shown full size
   * in the main column (the review step).
   */
  conceptImageSrc: string | null;
  /** "Original photo", or "Concept image" for older projects mapped on a render. */
  conceptImageAlt: string;
  isLabelling: boolean;
  /** Hover and selection are owned by the page, so this list and a full-size overlay stay in step. */
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (materialId: string | null) => void;
  onSelect: (materialId: string | null) => void;
  /** Resolves once the rename is saved; rejects to put the old name back. */
  onRename: (materialId: string, name: string) => Promise<void>;
  /** Resolves once the material is added; rejects to keep the name in the form for another try. */
  onAdd: (name: string) => Promise<void>;
  onDelete: (material: ProjectMaterialDto) => Promise<void>;
  onOpenConceptImage?: () => void;
  /** How the dots are laid out - owned by the page so the full-size review image follows the same switch. */
  dotStyle: DotStyle;
  onDotStyleChange: (style: DotStyle) => void;
  /** Opens the area editor; omitted until the concept image is labelled. */
  onEditAreas?: () => void;
  /** Present only while the materials await approval: renders the Approve / Try again actions. */
  review?: {
    canApprove: boolean;
    isBusy: boolean;
    onApprove: () => void;
    onRetry: () => void;
  };
}

/**
 * The project's materials: the photo they are mapped on with dots over each material's
 * surfaces, and the list - rename as plain text, add up to MAX_MATERIALS, delete. Every
 * change, and every redrawn area, applies to renders from then on; images already
 * generated stay as they are.
 */
export function MaterialsPanel({
  concept,
  conceptImageSrc,
  conceptImageAlt,
  isLabelling,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  onRename,
  onAdd,
  onDelete,
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

      {review && (
        <p className={styles.hint}>
          The main materials of your photo, with where they go. Rename, add or delete any and fix their areas - every render
          in this project uses them. Approve when they're right.
        </p>
      )}

      {conceptImageSrc ? (
        <div className={styles.preview}>
          <MaterialOverlay
            src={conceptImageSrc}
            alt={conceptImageAlt}
            materials={concept.materials}
            hidden={labelsHidden}
            activeId={activeId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
            dotStyle={dotStyle}
          />
          {onOpenConceptImage && (
            <button type="button" className={styles.expandButton} onClick={onOpenConceptImage} title={`Open the ${conceptImageAlt.toLowerCase()}`}>
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
        !review && <p className={styles.hint}>The image these materials were mapped on has been deleted.</p>
      )}

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
            onDelete={onDelete}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {concept.materials.length < MAX_MATERIALS ? (
        <AddMaterialForm onAdd={onAdd} />
      ) : (
        <p className={styles.footnote}>A project can have up to {MAX_MATERIALS} materials. Delete one to add another.</p>
      )}

      {review ? (
        <div className={styles.actions}>
          <button type="button" className={styles.approveButton} onClick={review.onApprove} disabled={!review.canApprove || review.isBusy}>
            {review.isBusy ? <Spinner /> : "Approve materials"}
          </button>
          <button
            type="button"
            className={styles.retryButton}
            onClick={review.onRetry}
            disabled={review.isBusy}
            title="Read the photo again and choose the materials from scratch (uses credits)"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className={styles.footnote}>Changes apply to images generated from now on.</p>
      )}
    </aside>
  );
}

function AddMaterialForm({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) {
    return (
      <button type="button" className={styles.addButton} onClick={() => setIsOpen(true)}>
        + Add material
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    try {
      await onAdd(trimmed);
      setName("");
      setIsOpen(false);
    } catch {
      // The page shows the error; the name stays for another try.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className={styles.addForm} onSubmit={submit}>
      <input
        type="text"
        className={styles.addInput}
        value={name}
        maxLength={MAX_NAME_LENGTH}
        placeholder="e.g. Weathered Corten steel cladding"
        aria-label="New material name"
        autoFocus
        disabled={isSaving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
        }}
      />
      <div className={styles.addActions}>
        <button type="button" className={styles.retryButton} onClick={() => setIsOpen(false)} disabled={isSaving}>
          Cancel
        </button>
        <button type="submit" className={styles.approveButton} disabled={!name.trim() || isSaving}>
          {isSaving ? <Spinner /> : "Add and draw its area"}
        </button>
      </div>
    </form>
  );
}

interface MaterialRowProps {
  material: ProjectMaterialDto;
  isActive: boolean;
  isSelected: boolean;
  /** Labelling ran and didn't find this material on the concept image, or it was added and has no area yet. */
  showMissing: boolean;
  onRename: (materialId: string, name: string) => Promise<void>;
  onDelete: (material: ProjectMaterialDto) => Promise<void>;
  onHover: (materialId: string | null) => void;
  onSelect: (materialId: string | null) => void;
}

function MaterialRow({ material, isActive, isSelected, showMissing, onRename, onDelete, onHover, onSelect }: MaterialRowProps) {
  const [draft, setDraft] = useState(material.name);
  const [isSaving, setIsSaving] = useState(false);
  // A material the user added has no written region - the API stores this placeholder, and
  // renders place it by its drawn area alone. Shown as what it means instead.
  const placedByArea = /^the area marked M\d+ on the material map$/i.test(material.regionDescription);

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

  const remove = async () => {
    setIsSaving(true);
    try {
      await onDelete(material);
    } finally {
      // Unmounted on success; this only matters when the delete failed or was cancelled.
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
          {placedByArea ? (
            material.box ? (
              "Placed where you drew it"
            ) : (
              <span className={styles.missing}>No area yet - draw it with Edit areas</span>
            )
          ) : (
            <>
              {material.regionDescription}
              {showMissing && <span className={styles.missing}> · not in view</span>}
            </>
          )}
        </span>
      </div>
      {isSaving ? (
        <Spinner />
      ) : (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => void remove()}
          aria-label={`Delete ${material.label} ${material.name}`}
          title="Delete this material"
        >
          ×
        </button>
      )}
    </li>
  );
}
