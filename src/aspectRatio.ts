/**
 * The "As image" aspect ratio choice: render at the ratio of the photo being rendered, as
 * closely as the image models allow. A UI-only value - requests always carry a concrete
 * ratio, resolved with resolveAspectRatio.
 */
export const AS_IMAGE = "image";

/** The supported ratio closest to width:height, compared on a log scale so 2:1 and 1:2 are equally far from 1:1. */
export function nearestAspectRatio(width: number, height: number, supported: string[]): string | null {
  if (!width || !height || supported.length === 0) return null;
  const target = Math.log(width / height);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const ratio of supported) {
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) continue;
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

/** A concrete ratio for a request: the photo's own when "As image" is chosen, else the choice itself. */
export function resolveAspectRatio(choice: string, imageRatio: string | null | undefined, fallback: string): string {
  return choice === AS_IMAGE ? (imageRatio ?? fallback) : choice;
}

/** Natural size of an image by URL. Rejects if it fails to load. */
export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("The image could not be loaded."));
    img.src = src;
  });
}

/** Natural size of a picked file, before it is uploaded. */
export async function measureFile(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await measureImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
