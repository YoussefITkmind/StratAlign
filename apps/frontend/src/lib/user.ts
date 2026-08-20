export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Session `name` sometimes ends up being the raw email (e.g. the
 * backend-unreachable auth fallback sets `name: email`). Never render an
 * email address as someone's name — fall back to a title-cased username
 * derived from the email's local part instead.
 */
export function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (trimmedName && trimmedName.toLowerCase() !== email?.trim().toLowerCase()) {
    return trimmedName;
  }

  const localPart = email?.trim().split("@")[0];
  if (!localPart) return trimmedName ?? "";

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}
