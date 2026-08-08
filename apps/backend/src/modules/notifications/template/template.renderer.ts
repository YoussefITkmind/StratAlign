import { PermanentError } from "../../../errors/app.errors";

/** `{{ path.to.value }}` — whitespace around the path is tolerated. */
const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export type TemplateData = Record<string, unknown>;

/**
 * Deliberately minimal placeholder substitution: dot-path lookup and nothing
 * else. No conditionals, no loops, no partials.
 *
 * A template language is a liability in a notification pipeline — it invites
 * logic into content, and every construct is another way for a render to fail
 * at delivery time. Anything needing iteration (the digest's item list) is
 * pre-formatted by its caller and passed in as a single value.
 */
export class TemplateRenderer {
  render(template: string, data: TemplateData): string {
    const missing: string[] = [];

    const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, path: string) => {
      const value = resolvePath(data, path);

      if (value === undefined || value === null) {
        missing.push(path);
        return "";
      }

      return formatValue(value, path, missing);
    });

    if (missing.length > 0) {
      // A template referencing data the caller did not supply is a coding
      // fault, not a transient one — retrying sends the same empty message.
      throw new PermanentError(
        `Template placeholders could not be resolved: ${[...new Set(missing)].join(", ")}`,
        { missing: [...new Set(missing)] },
      );
    }

    return rendered;
  }

  /** Reports unresolved placeholders without throwing. Used to validate
   * templates at seed time rather than at delivery time. */
  findMissingPlaceholders(template: string, data: TemplateData): string[] {
    const missing = new Set<string>();

    for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
      const value = resolvePath(data, match[1]);

      if (value === undefined || value === null) {
        missing.add(match[1]);
      }
    }

    return [...missing];
  }
}

function resolvePath(data: TemplateData, path: string): unknown {
  let current: unknown = data;

  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function formatValue(value: unknown, path: string, missing: string[]): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    // Arrays of scalars are joined; the digest relies on this for its item
    // list, which keeps the renderer free of loop syntax.
    return value
      .map((entry) =>
        entry instanceof Date ? entry.toISOString() : String(entry),
      )
      .join("\n");
  }

  // Objects have no sensible textual form here, and "[object Object]" in a
  // delivered message is worse than a loud failure.
  missing.push(path);

  return "";
}
