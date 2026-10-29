/** Index into --color-material-1..5 by label number, so a material keeps its colour wherever it's shown. */
export function materialColor(label: string): string {
  const n = Number(label.replace(/\D/g, "")) || 1;
  return `var(--color-material-${((n - 1) % 5) + 1})`;
}
