import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  /** "even": a regular grid. "random": the same density, each dot placed at random within its grid cell. */
  dotStyle?: DotStyle;
}

export type DotStyle = "even" | "random";

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

/**
 * A small seeded PRNG (FNV-1a hash of the seed into mulberry32), so a material's scattered
 * dots land in the same places on every render - hover re-renders the overlay constantly,
 * and Math.random would make the dots jump around each time.
 */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random-looking dots at an even density: one dot per grid cell, placed anywhere inside the
 * cell. Fully random positions clump in places and leave bare patches in others, which on a
 * small window can mean no dots at all; one-per-cell keeps every surface covered while
 * losing the visible rows and columns. Cells cover the material's bounding box on the same
 * global grid as the even style; the mask trims what falls outside the outline.
 */
function scatteredDots(polygons: Point[][], width: number, height: number, pitch: number, seed: string): Point[] {
  const xs = polygons.flat().map(([x]) => (x / 1000) * width);
  const ys = polygons.flat().map(([, y]) => (y / 1000) * height);
  const random = seededRandom(seed);
  const dots: Point[] = [];
  for (let cy = Math.floor(Math.min(...ys) / pitch); cy * pitch < Math.max(...ys); cy++) {
    for (let cx = Math.floor(Math.min(...xs) / pitch); cx * pitch < Math.max(...xs); cx++) {
      dots.push([(cx + random()) * pitch, (cy + random()) * pitch]);
    }
  }
  return dots;
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
 * A generated image with its concept materials marked on the actual surfaces as dots in
 * each material's colour - an even grid, or scattered at the same density (dotStyle) - the material underneath stays fully visible
 * between them - and a label chip. No outline and no tint behind the dots. Hovering or
 * selecting a material brightens it (its dots grow) and dims the rest.
 *
 * Drawn in the image's measured pixel space rather than a stretched 0-1000 viewBox: a
 * stretched viewBox would squash the dots into ellipses and space them differently across
 * and down. Where a smaller material sits inside a larger one (windows in a wall), the
 * larger one's dots are masked out of it, so the two grids never overlap. The image itself
 * is never modified - the backend stores only the outlines.
 */
export function MaterialOverlay({
  src,
  alt,
  materials,
  hidden,
  activeId,
  selectedId,
  onHover,
  onSelect,
  dotStyle = "even",
}: MaterialOverlayProps) {
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

  const shapes = useMemo(() => toShapes(materials), [materials]);
  const interactive = onHover != null || onSelect != null;

  const toPoints = (polygon: Point[]) =>
    size ? polygon.map(([x, y]) => `${(x / 1000) * size.width},${(y / 1000) * size.height}`).join(" ") : "";

  const pitch = size ? dotPitch(size.width) : 10;
  const radius = Math.max(1.5, pitch * 0.18);

  // Computed once per layout, not per hover: a large wall is a few thousand dots.
  const scattered = useMemo(
    () =>
      dotStyle === "random" && size
        ? shapes.map(({ material, polygons }) => scatteredDots(polygons, size.width, size.height, pitch, material.id))
        : null,
    [dotStyle, shapes, size, pitch],
  );

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
                    {/* The active material's dots grow a little - its only emphasis, since it has no outline or wash. */}
                    <circle cx={pitch / 2} cy={pitch / 2} r={activeId === material.id ? radius * 1.4 : radius} style={{ fill: color }} />
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
                  style={{ opacity: isActive ? 1 : isDimmed ? 0.25 : 0.85 }}
                  onMouseEnter={() => onHover?.(material.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(selectedId === material.id ? null : material.id);
                  }}
                >
                  {/* Dots only - no outline and no wash behind them, by request. */}
                  {scattered ? (
                    <g mask={`url(#${uid}-mask-${i})`} className={styles.dots} style={{ fill: color }}>
                      {scattered[i].map(([x, y], k) => (
                        <circle key={k} cx={x} cy={y} r={isActive ? radius * 1.4 : radius} />
                      ))}
                    </g>
                  ) : (
                    <rect
                      x={0}
                      y={0}
                      width={size.width}
                      height={size.height}
                      mask={`url(#${uid}-mask-${i})`}
                      style={{ fill: `url(#${uid}-dots-${i})` }}
                      className={styles.dots}
                    />
                  )}
                  {/* Invisible hit areas, so hovering anywhere on the surface - not just a dot - finds it. */}
                  {polygons.map((polygon, k) => (
                    <polygon key={k} points={toPoints(polygon)} className={styles.hitArea} />
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
