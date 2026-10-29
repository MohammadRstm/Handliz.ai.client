import { useLayoutEffect, useRef, useState } from "react";
import type { ProjectMaterialDto } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import styles from "./MaterialOverlay.module.css";

interface MaterialOverlayProps {
  /** Already absolute - callers resolve it through imageUrl(). */
  src: string;
  alt: string;
  materials: ProjectMaterialDto[];
  /** Hides the boxes, arrows and labels; the image stays. */
  hidden?: boolean;
  /** Emphasizes one material and dims the rest - driven by hovering its row in the panel. */
  highlightedId?: string | null;
}

const CHIP_W = 30;
const CHIP_H = 20;
const GAP = 6;

interface Placed {
  material: ProjectMaterialDto;
  color: string;
  box: { x: number; y: number; w: number; h: number };
  chip: { x: number; y: number };
}

/**
 * Lays each label chip just outside its box, on whichever side has room, and stacks chips
 * that would overlap. Boxes routinely nest (a wall box around a door box), so without the
 * stacking two labels land on the same spot.
 */
function place(materials: ProjectMaterialDto[], width: number, height: number): Placed[] {
  const placed: Placed[] = materials
    .filter((m) => m.box)
    .map((m) => {
      const b = m.box!;
      const box = {
        x: (b.xMin / 1000) * width,
        y: (b.yMin / 1000) * height,
        w: ((b.xMax - b.xMin) / 1000) * width,
        h: ((b.yMax - b.yMin) / 1000) * height,
      };
      let x: number;
      if (box.x - CHIP_W - GAP * 3 >= 0) x = box.x - CHIP_W - GAP * 3;
      else if (box.x + box.w + CHIP_W + GAP * 3 <= width) x = box.x + box.w + GAP * 3;
      else x = box.x + GAP;
      const y = Math.min(Math.max(box.y + GAP, GAP), height - CHIP_H - GAP);
      return { material: m, color: materialColor(m.label), box, chip: { x, y } };
    })
    .sort((a, b) => a.chip.y - b.chip.y);

  for (let i = 1; i < placed.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = placed[j].chip;
      const c = placed[i].chip;
      const overlapsX = Math.abs(a.x - c.x) < CHIP_W + 2;
      const overlapsY = Math.abs(a.y - c.y) < CHIP_H + 2;
      if (overlapsX && overlapsY) c.y = Math.min(a.y + CHIP_H + 4, height - CHIP_H - GAP);
    }
  }
  return placed;
}

/**
 * A generated image with its concept materials drawn on top: a box around each material's
 * region, a label chip, and an arrow from the chip into the region. Drawn in the image's
 * own rendered pixel space (measured, not a 0-1000 viewBox stretched over it) so text and
 * strokes keep their size whatever the image's aspect ratio. The image itself is never
 * modified - the backend stores only the box coordinates.
 */
export function MaterialOverlay({ src, alt, materials, hidden, highlightedId }: MaterialOverlayProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const observer = new ResizeObserver(() => {
      if (img.clientWidth > 0 && img.clientHeight > 0) setSize({ width: img.clientWidth, height: img.clientHeight });
    });
    observer.observe(img);
    return () => observer.disconnect();
  }, [src]);

  const placed = size ? place(materials, size.width, size.height) : [];

  return (
    <div className={styles.wrap}>
      <img ref={imgRef} src={src} alt={alt} className={styles.image} />
      {size && !hidden && placed.length > 0 && (
        <svg className={styles.svg} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <defs>
            {placed.map(({ material, color }) => (
              <marker
                key={material.id}
                id={`arrow-${material.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: color }} />
              </marker>
            ))}
          </defs>
          {placed.map(({ material, color, box, chip }) => {
            const dimmed = highlightedId != null && highlightedId !== material.id;
            const emphasized = highlightedId === material.id;
            const chipCenterY = chip.y + CHIP_H / 2;
            const startX = chip.x < box.x ? chip.x + CHIP_W : chip.x > box.x + box.w ? chip.x : chip.x + CHIP_W / 2;
            const startY = chip.x < box.x || chip.x > box.x + box.w ? chipCenterY : chip.y + CHIP_H;
            return (
              <g key={material.id} className={styles.material} style={{ opacity: dimmed ? 0.25 : 1 }}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={3}
                  className={styles.box}
                  style={{ stroke: color, strokeWidth: emphasized ? 3.5 : 2 }}
                />
                <line
                  x1={startX}
                  y1={startY}
                  x2={box.x + box.w / 2}
                  y2={box.y + box.h / 2}
                  className={styles.arrow}
                  style={{ stroke: color }}
                  markerEnd={`url(#arrow-${material.id})`}
                />
                <rect x={chip.x} y={chip.y} width={CHIP_W} height={CHIP_H} rx={5} style={{ fill: color }} />
                <text x={chip.x + CHIP_W / 2} y={chipCenterY} className={styles.chipText}>
                  {material.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
