import { useState } from "react";
import type { ProjectMaterialDto, ProjectMaterialsResponse } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import { MaterialOverlay } from "./MaterialOverlay";
import { Spinner } from "./Spinner";
import styles from "./MaterialsPanel.module.css";

const MAX_NAME_LENGTH = 100;

interface MaterialsPanelProps {
  concept: ProjectMaterialsResponse;
  /** Full-size signed URL of the concept image, already absolute - or null before the first image lands. */
  conceptImageSrc: string | null;
  /** With no concept image, decides whether the hint says "wait for the first image" or "pick one" (after the concept image was deleted). */
  hasGeneratedImages: boolean;
  isLabelling: boolean;
  /** Resolves once the rename is saved; rejects to put the old name back. */
  onRename: (materialId: string, name: string) => Promise<void>;
  onOpenConceptImage?: () => void;
}

/**
 * The project's material concept, beside the grid: the concept image with each material
 * boxed and labelled, and the list of materials with their names editable as plain text.
 * A rename only changes future generations - the existing images, and the boxes on the
 * concept image, stay as they are.
 */
export function MaterialsPanel({
  concept,
  conceptImageSrc,
  hasGeneratedImages,
  isLabelling,
  onRename,
  onOpenConceptImage,
}: MaterialsPanelProps) {
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  return (
    <aside className={styles.panel} aria-label="Materials">
      <div className={styles.header}>
        <h2 className={styles.heading}>Materials</h2>
        {conceptImageSrc && concept.conceptLabelled && (
          <button type="button" className={styles.toggle} onClick={() => setLabelsHidden((v) => !v)} aria-pressed={labelsHidden}>
            {labelsHidden ? "Show labels" : "Hide labels"}
          </button>
        )}
      </div>

      {conceptImageSrc ? (
        <div className={styles.preview}>
          <button type="button" className={styles.previewButton} onClick={onOpenConceptImage} title="Open the concept image">
            <MaterialOverlay
              src={conceptImageSrc}
              alt="Concept image"
              materials={concept.materials}
              hidden={labelsHidden}
              highlightedId={highlightedId}
            />
          </button>
          {isLabelling && (
            <div className={styles.labelling}>
              <Spinner />
              <span>Locating materials...</span>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.hint}>
          {hasGeneratedImages
            ? "Use “Set as concept” on an image to show where these materials are."
            : "The materials are labelled on the first image once it's ready."}
        </p>
      )}

      <ul className={styles.list}>
        {concept.materials.map((material) => (
          // Keyed by the saved name too, so a row restarts from the server's value whenever
          // it changes (a save, a reload) instead of syncing its draft in an effect.
          <MaterialRow
            key={`${material.id}:${material.name}`}
            material={material}
            showMissing={concept.conceptLabelled && !material.box}
            onRename={onRename}
            onHover={setHighlightedId}
          />
        ))}
      </ul>

      <p className={styles.footnote}>Renaming a material applies to images generated from now on.</p>
    </aside>
  );
}

interface MaterialRowProps {
  material: ProjectMaterialDto;
  /** Labelling ran and didn't find this material on the concept image. */
  showMissing: boolean;
  onRename: (materialId: string, name: string) => Promise<void>;
  onHover: (materialId: string | null) => void;
}

function MaterialRow({ material, showMissing, onRename, onHover }: MaterialRowProps) {
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
    <li className={styles.row} onMouseEnter={() => onHover(material.id)} onMouseLeave={() => onHover(null)}>
      <span className={styles.chip} style={{ background: materialColor(material.label) }}>
        {material.label}
      </span>
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
