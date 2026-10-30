import type { ProjectMaterialDto } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import styles from "./MaterialOverlay.module.css";

interface MaterialOverlayProps {
  /** Already absolute - callers resolve it through imageUrl(). */
  src: string;
  alt: string;
  materials: ProjectMaterialDto[];
  /** Hides the fills and labels; the image stays. */
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
 * A generated image with its concept materials painted over the actual surfaces: each
 * material's outline filled with its colour at low opacity, so the material underneath stays
 * visible, plus a small label chip. Hovering or selecting a material brightens it and dims the
 * rest. Drawn in a 0-1000 viewBox stretched over the image (outlines are normalized the same
 * way), with non-scaling strokes so edges stay crisp at any size. The image itself is never
 * modified - the backend stores only the outlines.
 */
export function MaterialOverlay({ src, alt, materials, hidden, activeId, selectedId, onHover, onSelect }: MaterialOverlayProps) {
  const shapes = toShapes(materials);
  const interactive = onHover != null || onSelect != null;

  return (
    <div className={styles.wrap} onMouseLeave={() => onHover?.(null)}>
      <img src={src} alt={alt} className={styles.image} onClick={() => onSelect?.(null)} />
      {!hidden && shapes.length > 0 && (
        <>
          <svg className={styles.svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            {shapes.map(({ material, color, polygons }) => {
              const isActive = activeId === material.id;
              const isDimmed = activeId != null && !isActive;
              return (
                <g
                  key={material.id}
                  className={`${styles.material} ${interactive ? styles.interactive : ""}`}
                  style={{
                    fill: color,
                    stroke: color,
                    fillOpacity: isActive ? 0.55 : isDimmed ? 0.1 : 0.28,
                    strokeOpacity: isActive || selectedId === material.id ? 1 : isDimmed ? 0.25 : 0.7,
                    strokeWidth: isActive ? 2.5 : 1.25,
                  }}
                  onMouseEnter={() => onHover?.(material.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(selectedId === material.id ? null : material.id);
                  }}
                >
                  {polygons.map((points, i) => (
                    <polygon key={i} points={points.map(([x, y]) => `${x},${y}`).join(" ")} vectorEffect="non-scaling-stroke" />
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
