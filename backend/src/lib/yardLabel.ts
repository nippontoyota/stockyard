/** Display label for a yard site: "TR01C · Showroom, Enchakkal". */
export function formatYardLabel(
  yard: { code?: string | null; name?: string | null; id?: string | null } | null | undefined,
  fallback = "Unknown"
): string {
  if (!yard) return fallback;
  const code = yard.code?.trim() || "";
  const name = yard.name?.trim() || "";
  if (code && name) return `${code} · ${name}`;
  return code || name || yard.id || fallback;
}
