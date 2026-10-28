import { useState } from "react";
import type { ProjectSummaryDto } from "../api/projectTypes";
import { imageUrl } from "../api/client";
import { TrashIcon } from "./icons";
import { Spinner } from "./Spinner";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: ProjectSummaryDto;
  onClick: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

function formatLastUsed(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ProjectCard({ project, onClick, onDelete, isDeleting }: ProjectCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  const label = project.title ?? project.location;

  // The card used to be one big <button>. It is now a div wrapping a button, because the
  // delete control has to be a real button too and nesting one inside another is invalid
  // HTML that browsers resolve unpredictably. Same structure ProjectImageTile already uses
  // for its own overlay controls.
  return (
    <div
      className={styles.card}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button type="button" className={styles.cardButton} onClick={onClick}>
        {project.thumbnailUrl ? (
          <img
            src={imageUrl(project.thumbnailUrl)}
            alt={label}
            className={styles.thumbnail}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.placeholder}>No image yet</div>
        )}

        <div className={styles.footer}>
          <span className={styles.location}>{label}</span>
          <span className={styles.count}>{project.requestedImageCount} img</span>
        </div>
      </button>

      {/* stopPropagation is belt and braces here - the two buttons are siblings rather
          than nested - but it keeps the delete click from ever reaching an ancestor
          handler if this card is later dropped into something clickable. */}
      <button
        type="button"
        className={styles.deleteButton}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        aria-label={`Delete ${label}`}
        title="Delete this project"
      >
        {isDeleting ? <Spinner /> : <TrashIcon size={14} />}
      </button>

      {isHovering && <div className={styles.hoverDate}>Last used {formatLastUsed(project.lastUsedAtUtc)}</div>}
    </div>
  );
}
