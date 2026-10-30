import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ProjectMaterialDto } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import styles from "./MaterialOverlay.module.css";

interface MaterialOverlayProps {
  /** Already absolute - callers resolve it through imageUrl(). */
  src: string;
  alt: string;
  materials: ProjectMaterialDto[];
  /** Hides the dots and labels; the image stays. */
  hidden?: boolean;
  /** Brightened, with the others dimmed - whichever material is hovered or selected. */
  activeId?: string | null;
  /** Pinned by a click; shown with a solid outline even when another one is hovered. */
  selectedId?: string | null;
  onHover?: (materialId: string | null) => void;
  /** Clicking a material selects it; clicking it again, or empty image, clears the selection. */
  onSelect?: (materialId: string | null) => void;
}

type Point = [number, number];

interface Shape {
  material: ProjectMaterialDto;
  color: string;
  /** Each polygon as [x, y] points on the 0-1000 scale. */
  polygons: Point[][];
  area: number;
  /** Chip position as percentages of the image, at the centre of the material's largest polygon. */
  chip: { left: number; top: number };
}

/**
 * Dot grid pitch in rendered pixels: about 80 dots across the image, so the pattern reads
 * the same in the full-width review image as on a large screen, but never closer than 8 px -
 * at 6 px the ~300 px panel preview turned into a haze rather than dots - or further than
 * 14 px, where thin surfaces like a fascia get no dots at all.
 */
function dotPitch(width: number): number {
  return Math.min(14, Math.max(8, width / 80));
}

function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function centroid(points: Point[]): Point {
  const x = points.reduce((s, p) => s + p[0], 0) / points.length;
  const y = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [x, y];
}

/**
 * Builds each material's polygons from the API's [y, x] outlines - or, for images labelled
 * before outlines existed, from its box - and orders them largest first, so smaller surfaces
 * (windows, a door) are drawn on top of the wall they sit in and receive the hover.
 */
function toShapes(materials: ProjectMaterialDto[]): Shape[] {
  return materials
    .map((material): Shape | null => {
      let polygons: Point[][];
      if (material.polygons && material.polygons.length > 0) {
        polygons = material.polygons.map((poly) => poly.map(([y, x]) => [x, y] as Point));
      } else if (material.box) {
        const { yMin, xMin, yMax, xMax } = material.box;
        polygons = [[[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]];
      } else {
        return null;
      }
      const areas = polygons.map(polygonArea);
      const largest = polygons[areas.indexOf(Math.max(...areas))];
      const [cx, cy] = centroid(largest);
      return {
        material,
        color: materialColor(material.label),
        polygons,
        area: areas.reduce((s, a) => s + a, 0),
        chip: { left: cx / 10, top: cy / 10 },
      };
    })
    .filter((shape): shape is Shape => shape !== null)
    .sort((a, b) => b.area - a.area);
}

/**
 * A generated image with its concept materials marked on the actual surfaces as an even
 * grid of dots in each material's colour - the material underneath stays fully visible
 * between them - plus a thin outline and a label chip. Hovering or selecting a material
 * brightens it and dims the rest.
 *
 * Drawn in the image's measured pixel space rather than a stretched 0-1000 viewBox: a
 * stretched viewBox would squash the dots into ellipses and space them differently across
 * and down. Where a smaller material sits inside a larger one (windows in a wall), the
 * larger one's dots are masked out of it, so the two grids never overlap. The image itself
 * is never modified - the backend stores only the outlines.
 */
export function MaterialOverlay({ src, alt, materials, hidden, activeId, selectedId, onHover, onSelect }: MaterialOverlayProps) {
  const uid = useId().replace(/:/g, "");
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

  const shapes = toShapes(materials);
  const interactive = onHover != null || onSelect != null;

  const toPoints = (polygon: Point[]) =>
    size ? polygon.map(([x, y]) => `${(x / 1000) * size.width},${(y / 1000) * size.height}`).join(" ") : "";

  const pitch = size ? dotPitch(size.width) : 10;
  const radius = Math.max(1.5, pitch * 0.18);

  return (
    <div className={styles.wrap} onMouseLeave={() => onHover?.(null)}>
      <img ref={imgRef} src={src} alt={alt} className={styles.image} onClick={() => onSelect?.(null)} />
      {size && !hidden && shapes.length > 0 && (
        <>
          <svg className={styles.svg} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
            <defs>
              {shapes.map(({ material, color }, i) => (
                <g key={material.id}>
                  <pattern id={`${uid}-dots-${i}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
                    <circle cx={pitch / 2} cy={pitch / 2} r={radius} style={{ fill: color }} />
                  </pattern>
                  {/* Everything this material covers, minus the smaller materials drawn on top of it. */}
                  <mask id={`${uid}-mask-${i}`} maskUnits="userSpaceOnUse" x={0} y={0} width={size.width} height={size.height}>
                    {shapes[i].polygons.map((polygon, k) => (
                      <polygon key={k} points={toPoints(polygon)} fill="white" />
                    ))}
                    {shapes.slice(i + 1).flatMap((smaller) =>
                      smaller.polygons.map((polygon, k) => (
                        <polygon key={`${smaller.material.id}-${k}`} points={toPoints(polygon)} fill="black" />
                      )),
                    )}
                  </mask>
                </g>
              ))}
            </defs>

            {shapes.map(({ material, color, polygons }, i) => {
              const isActive = activeId === material.id;
              const isDimmed = activeId != null && !isActive;
              return (
                <g
                  key={material.id}
                  className={`${styles.material} ${interactive ? styles.interactive : ""}`}
                  style={{ opacity: isDimmed ? 0.3 : 1 }}
                  onMouseEnter={() => onHover?.(material.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(selectedId === material.id ? null : material.id);
                  }}
                >
                  {/* The dots. A faint wash only on the active material, so it still reads as lit. */}
                  <rect
                    x={0}
                    y={0}
                    width={size.width}
                    height={size.height}
                    mask={`url(#${uid}-mask-${i})`}
                    style={{ fill: `url(#${uid}-dots-${i})`, opacity: isActive ? 1 : 0.85 }}
                    className={styles.dots}
                  />
                  {isActive && (
                    <rect
                      x={0}
                      y={0}
                      width={size.width}
                      height={size.height}
                      mask={`url(#${uid}-mask-${i})`}
                      style={{ fill: color, opacity: 0.18 }}
                      className={styles.dots}
                    />
                  )}
                  {/* Transparent hit areas and a thin edge, so the dotted region keeps a clear boundary. */}
                  {polygons.map((polygon, k) => (
                    <polygon
                      key={k}
                      points={toPoints(polygon)}
                      className={styles.edge}
                      style={{
                        stroke: color,
                        strokeOpacity: isActive || selectedId === material.id ? 0.95 : 0.45,
                        strokeWidth: isActive ? 2 : 1,
                      }}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          {shapes.map(({ material, color, chip }) => (
            <span
              key={material.id}
              className={`${styles.chip} ${activeId != null && activeId !== material.id ? styles.chipDimmed : ""}`}
              style={{ left: `${chip.left}%`, top: `${chip.top}%`, background: color }}
              onMouseEnter={() => onHover?.(material.id)}
              onClick={() => onSelect?.(selectedId === material.id ? null : material.id)}
              aria-hidden="true"
            >
              {material.label}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
