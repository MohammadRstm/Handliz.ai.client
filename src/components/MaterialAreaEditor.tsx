import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectMaterialDto } from "../api/projectTypes";
import { materialColor } from "./materialColor";
import { MaterialOverlay, type DotStyle } from "./MaterialOverlay";
import styles from "./MaterialAreaEditor.module.css";

/** [y, x] on the 0-1000 scale - the API's own convention, kept here so saves need no conversion. */
type Point = [number, number];
type Areas = Record<string, Point[][]>;

const MAX_UNDO = 50;
const SAVE_DELAY_MS = 500;

interface MaterialAreaEditorProps {
  /** Full-size signed URL of the concept image, already absolute. */
  imageSrc: string;
  materials: ProjectMaterialDto[];
  dotStyle: DotStyle;
  initialMaterialId?: string | null;
  /** Persists one material's complete set of areas; rejects to show the save as failed. */
  onSave: (materialId: string, polygons: Point[][]) => Promise<void>;
  onClose: () => void;
}

type Drag = ({ kind: "vertex"; vertex: number } | { kind: "polygon"; start: Point; original: Point[] }) & {
  materialId: string;
  polygon: number;
  /** Set on the first pointer move - a click that only selects is neither an undo step nor a save. */
  moved: boolean;
};

const clamp = (v: number) => Math.round(Math.min(1000, Math.max(0, v)));

function initialAreas(materials: ProjectMaterialDto[]): Areas {
  const areas: Areas = {};
  for (const m of materials) {
    if (m.polygons && m.polygons.length > 0) {
      areas[m.id] = m.polygons.map((p) => p.map(([y, x]) => [y, x] as Point));
    } else if (m.box) {
      // Labelled before outlines existed: the box becomes an editable four-point area.
      const { yMin, xMin, yMax, xMax } = m.box;
      areas[m.id] = [[[yMin, xMin], [yMin, xMax], [yMax, xMax], [yMax, xMin]]];
    } else {
      areas[m.id] = [];
    }
  }
  return areas;
}

/**
 * Full-size editor for the concept image's material areas. Everything happens locally and
 * instantly - the dots redraw while dragging - and each finished change is saved in the
 * background, debounced per material. No AI is involved: the areas are just the polygons
 * labelling traced, now in the user's hands. Overlay only; generation doesn't read them.
 */
export function MaterialAreaEditor({ imageSrc, materials, dotStyle, initialMaterialId, onSave, onClose }: MaterialAreaEditorProps) {
  const [areas, setAreas] = useState<Areas>(() => initialAreas(materials));
  // Undo history in a ref, not state: pushing and popping happen inside event handlers, and
  // doing them in state updaters would run twice under StrictMode (one Ctrl+Z, two steps).
  const historyRef = useRef<Areas[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [materialId, setMaterialId] = useState<string>(initialMaterialId ?? materials[0]?.id ?? "");
  const [polygonIndex, setPolygonIndex] = useState<number | null>(null);
  const [vertexIndex, setVertexIndex] = useState<number | null>(null);
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");

  const layerRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const areasRef = useRef(areas);
  const pendingSaves = useRef(new Map<string, number>());
  const inFlight = useRef(0);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver(() => setSize({ width: layer.clientWidth, height: layer.clientHeight }));
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const save = useCallback(
    (id: string) => {
      pendingSaves.current.delete(id);
      inFlight.current += 1;
      setSaveState("saving");
      onSave(id, areasRef.current[id] ?? [])
        .then(() => {
          inFlight.current -= 1;
          if (inFlight.current === 0 && pendingSaves.current.size === 0) setSaveState("saved");
        })
        .catch(() => {
          inFlight.current -= 1;
          setSaveState("error");
        });
    },
    [onSave],
  );

  // Debounced per material, so a burst of nudges is one request, and editing two materials
  // in quick succession saves both.
  const scheduleSave = useCallback(
    (id: string) => {
      const existing = pendingSaves.current.get(id);
      if (existing) window.clearTimeout(existing);
      pendingSaves.current.set(id, window.setTimeout(() => save(id), SAVE_DELAY_MS));
      setSaveState("pending");
    },
    [save],
  );

  const flushSaves = useCallback(() => {
    for (const [id, timer] of pendingSaves.current) {
      window.clearTimeout(timer);
      save(id);
    }
  }, [save]);

  const pushHistory = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-(MAX_UNDO - 1)), areasRef.current];
    setUndoCount(historyRef.current.length);
  }, []);

  /** Applies a change to one material's areas, recording the previous state for undo. */
  const change = useCallback(
    (id: string, next: Point[][]) => {
      pushHistory();
      const updated = { ...areasRef.current, [id]: next };
      areasRef.current = updated;
      setAreas(updated);
      scheduleSave(id);
    },
    [pushHistory, scheduleSave],
  );

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    setUndoCount(historyRef.current.length);
    const current = areasRef.current;
    areasRef.current = previous;
    setAreas(previous);
    for (const id of Object.keys(previous)) {
      if (previous[id] !== current[id]) scheduleSave(id);
    }
    setPolygonIndex(null);
    setVertexIndex(null);
  }, [scheduleSave]);

  const deleteSelection = useCallback(() => {
    if (polygonIndex === null) return;
    const polygons = areasRef.current[materialId] ?? [];
    const polygon = polygons[polygonIndex];
    if (!polygon) return;
    if (vertexIndex !== null && polygon.length > 3) {
      // A point goes first; the whole section only once it's selected without a point.
      change(materialId, polygons.map((p, i) => (i === polygonIndex ? p.filter((_, k) => k !== vertexIndex) : p)));
      setVertexIndex(null);
    } else {
      change(materialId, polygons.filter((_, i) => i !== polygonIndex));
      setPolygonIndex(null);
      setVertexIndex(null);
    }
  }, [change, materialId, polygonIndex, vertexIndex]);

  const finishDrawing = useCallback(() => {
    if (!drawing || drawing.length < 3) return;
    const polygons = areasRef.current[materialId] ?? [];
    change(materialId, [...polygons, drawing]);
    setPolygonIndex(polygons.length);
    setVertexIndex(null);
    setDrawing(null);
  }, [change, drawing, materialId]);

  const close = useCallback(() => {
    flushSaves();
    onClose();
  }, [flushSaves, onClose]);

  // Captured at the window so these keys never reach the project page underneath, whose
  // own Delete/Backspace handler deletes the selected images.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        handled();
        undo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled();
        if (drawing) setDrawing(drawing.length > 1 ? drawing.slice(0, -1) : null);
        else deleteSelection();
      } else if (event.key === "Enter") {
        handled();
        finishDrawing();
      } else if (event.key === "Escape") {
        handled();
        if (drawing) setDrawing(null);
        else if (polygonIndex !== null) {
          setPolygonIndex(null);
          setVertexIndex(null);
        } else close();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, deleteSelection, drawing, finishDrawing, polygonIndex, undo]);

  const toUnit = (event: React.PointerEvent | React.MouseEvent): Point => {
    const rect = layerRef.current!.getBoundingClientRect();
    return [clamp(((event.clientY - rect.top) / rect.height) * 1000), clamp(((event.clientX - rect.left) / rect.width) * 1000)];
  };

  const toPx = ([y, x]: Point): [number, number] => (size ? [(x / 1000) * size.width, (y / 1000) * size.height] : [0, 0]);
  const toPoints = (polygon: Point[]) => polygon.map((p) => toPx(p).join(",")).join(" ");

  const startDrag = (event: React.PointerEvent, drag: Drag) => {
    event.stopPropagation();
    dragRef.current = drag;
    layerRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      // The pre-drag state is the undo point; the move itself streams without new entries.
      pushHistory();
      drag.moved = true;
    }
    const point = toUnit(event);
    const polygons = areasRef.current[drag.materialId] ?? [];
    const next = polygons.map((polygon, i) => {
      if (i !== drag.polygon) return polygon;
      if (drag.kind === "vertex") return polygon.map((p, k) => (k === drag.vertex ? point : p));
      const [dy, dx] = [point[0] - drag.start[0], point[1] - drag.start[1]];
      return drag.original.map(([y, x]) => [clamp(y + dy), clamp(x + dx)] as Point);
    });
    const updated = { ...areasRef.current, [drag.materialId]: next };
    areasRef.current = updated;
    setAreas(updated);
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) scheduleSave(drag.materialId);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent) => {
    if (drawing) {
      const point = toUnit(event);
      // Clicking near the first point closes the shape, like most drawing tools. Only checked
      // from the third point on - before that there may be no first point to measure from.
      if (drawing.length >= 3) {
        const [fx, fy] = toPx(drawing[0]);
        const [px, py] = toPx(point);
        if (Math.hypot(fx - px, fy - py) < 10) {
          finishDrawing();
          return;
        }
      }
      setDrawing([...drawing, point]);
      return;
    }
    setPolygonIndex(null);
    setVertexIndex(null);
  };

  // The overlay underneath renders the live edited areas, so the dots follow every drag.
  const liveMaterials = useMemo(
    () =>
      materials.map((m) => {
        const polygons = areas[m.id] ?? [];
        return { ...m, polygons: polygons.length > 0 ? polygons : null, box: polygons.length > 0 ? m.box : null };
      }),
    [areas, materials],
  );

  const selected = materials.find((m) => m.id === materialId);
  const selectedColor = selected ? materialColor(selected.label) : "#fff";
  const selectedPolygons = areas[materialId] ?? [];

  const statusText = { saved: "All changes saved", pending: "Unsaved changes...", saving: "Saving...", error: "Couldn't save - keep editing to retry" }[
    saveState
  ];

  return (
    <div className={styles.backdrop}>
      <div className={styles.editor} role="dialog" aria-modal="true" aria-label="Edit material areas">
        <div className={styles.canvas}>
          <div className={styles.imageWrap}>
            <MaterialOverlay src={imageSrc} alt="Concept image" materials={liveMaterials} activeId={materialId} dotStyle={dotStyle} />
            <svg
              ref={layerRef}
              className={`${styles.layer} ${drawing ? styles.drawing : ""}`}
              viewBox={size ? `0 0 ${size.width} ${size.height}` : undefined}
              onPointerDown={handleBackgroundPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {size && (
                <>
                  {/* Other materials' areas: click one to switch to it. */}
                  {!drawing &&
                    materials
                      .filter((m) => m.id !== materialId)
                      .flatMap((m) =>
                        (areas[m.id] ?? []).map((polygon, i) => (
                          <polygon
                            key={`${m.id}-${i}`}
                            points={toPoints(polygon)}
                            className={styles.otherArea}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setMaterialId(m.id);
                              setPolygonIndex(i);
                              setVertexIndex(null);
                            }}
                          />
                        )),
                      )}

                  {selectedPolygons.map((polygon, i) => {
                    const isSelected = polygonIndex === i;
                    return (
                      <g key={i} style={{ color: selectedColor }}>
                        <polygon
                          points={toPoints(polygon)}
                          className={`${styles.area} ${isSelected ? styles.areaSelected : ""}`}
                          onPointerDown={(e) => {
                            if (drawing) return;
                            setPolygonIndex(i);
                            setVertexIndex(null);
                            startDrag(e, { kind: "polygon", materialId, polygon: i, start: toUnit(e), original: polygon, moved: false });
                          }}
                        />
                        {/* Wide invisible edges: double-click one to add a point there. */}
                        {!drawing &&
                          polygon.map((point, k) => {
                            const next = polygon[(k + 1) % polygon.length];
                            const [x1, y1] = toPx(point);
                            const [x2, y2] = toPx(next);
                            return (
                              <line
                                key={`edge-${k}`}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                className={styles.edge}
                                onPointerDown={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  const inserted = [...polygon.slice(0, k + 1), toUnit(e), ...polygon.slice(k + 1)];
                                  change(materialId, selectedPolygons.map((p, j) => (j === i ? inserted : p)));
                                  setPolygonIndex(i);
                                  setVertexIndex(k + 1);
                                }}
                              />
                            );
                          })}
                        {!drawing &&
                          polygon.map((point, k) => {
                            const [x, y] = toPx(point);
                            const isVertexSelected = isSelected && vertexIndex === k;
                            return (
                              <circle
                                key={`v-${k}`}
                                cx={x}
                                cy={y}
                                r={isVertexSelected ? 6.5 : 5}
                                className={`${styles.handle} ${isVertexSelected ? styles.handleSelected : ""}`}
                                onPointerDown={(e) => {
                                  setPolygonIndex(i);
                                  setVertexIndex(k);
                                  startDrag(e, { kind: "vertex", materialId, polygon: i, vertex: k, moved: false });
                                }}
                              />
                            );
                          })}
                      </g>
                    );
                  })}

                  {drawing && (
                    <g style={{ color: selectedColor }}>
                      <polyline points={toPoints(drawing)} className={styles.drawingLine} />
                      {drawing.map((point, k) => {
                        const [x, y] = toPx(point);
                        return <circle key={k} cx={x} cy={y} r={k === 0 ? 7 : 4.5} className={k === 0 ? styles.drawingStart : styles.handle} />;
                      })}
                    </g>
                  )}
                </>
              )}
            </svg>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <h2 className={styles.title}>Edit material areas</h2>

          <ul className={styles.materials}>
            {materials.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`${styles.material} ${m.id === materialId ? styles.materialActive : ""}`}
                  style={{ "--material-color": materialColor(m.label) } as React.CSSProperties}
                  onClick={() => {
                    setMaterialId(m.id);
                    setPolygonIndex(null);
                    setVertexIndex(null);
                    setDrawing(null);
                  }}
                >
                  <span className={styles.chip}>{m.label}</span>
                  <span className={styles.materialName}>{m.name}</span>
                  <span className={styles.count}>{(areas[m.id] ?? []).length}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.tools}>
            <button
              type="button"
              className={`${styles.tool} ${drawing ? styles.toolActive : ""}`}
              onClick={() => (drawing ? finishDrawing() : setDrawing([]))}
              disabled={drawing !== null && drawing.length > 0 && drawing.length < 3}
            >
              {drawing ? (drawing.length >= 3 ? "Finish area" : "Click to add points...") : "Add area"}
            </button>
            <button type="button" className={styles.tool} onClick={deleteSelection} disabled={polygonIndex === null || drawing !== null}>
              {vertexIndex !== null && (selectedPolygons[polygonIndex ?? -1]?.length ?? 0) > 3 ? "Delete point" : "Delete area"}
            </button>
            <button type="button" className={styles.tool} onClick={undo} disabled={undoCount === 0}>
              Undo
            </button>
          </div>

          <ul className={styles.help}>
            <li>Drag an area to move it, or a point to reshape it.</li>
            <li>Double-click an edge to add a point.</li>
            <li>Select a point or an area and press Delete.</li>
            <li>Add area: click around the shape, then click the first point or press Enter.</li>
            <li>Ctrl+Z undoes. Areas change the overlay only.</li>
          </ul>

          <div className={styles.footer}>
            <span className={`${styles.status} ${saveState === "error" ? styles.statusError : ""}`}>{statusText}</span>
            <button type="button" className={styles.done} onClick={close}>
              Done
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
