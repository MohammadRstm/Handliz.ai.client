/** A project can have up to eight materials, M1..M8 - the API refuses a ninth. */
export const MAX_MATERIALS = 8;

/** Index into --color-material-1..8 by label number, so a material keeps its colour wherever it's shown. */
export function materialColor(label: string): string {
  const n = Number(label.replace(/\D/g, "")) || 1;
  return `var(--color-material-${((n - 1) % MAX_MATERIALS) + 1})`;
}
