import { describe, expect, it } from "vitest";
import { TemplateRenderer } from "../../src/modules/notifications/template/template.renderer";
import { PermanentError } from "../../src/errors/app.errors";

const renderer = new TemplateRenderer();

describe("TemplateRenderer", () => {
  it("substitutes a simple placeholder", () => {
    expect(renderer.render("Hello {{name}}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderer.render("Hello {{  name  }}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("resolves dot paths", () => {
    const result = renderer.render("Period {{period.key}}", {
      period: { key: "2026-08" },
    });

    expect(result).toBe("Period 2026-08");
  });

  it("renders numbers and booleans", () => {
    expect(renderer.render("{{count}} / {{done}}", { count: 3, done: true })).toBe(
      "3 / true",
    );
  });

  it("renders a Date as an ISO string", () => {
    const result = renderer.render("{{at}}", {
      at: new Date("2026-08-05T09:00:00Z"),
    });

    expect(result).toBe("2026-08-05T09:00:00.000Z");
  });

  it("joins arrays with newlines, which is how the digest lists its items", () => {
    const result = renderer.render("{{items}}", {
      items: ["• first", "• second"],
    });

    expect(result).toBe("• first\n• second");
  });

  it("renders Arabic content unchanged", () => {
    const result = renderer.render("المراجعة مستحقة — {{periodKey}}", {
      periodKey: "2026-08",
    });

    expect(result).toBe("المراجعة مستحقة — 2026-08");
  });

  it("throws a permanent error when a placeholder is missing", () => {
    expect(() => renderer.render("Hello {{name}}", {})).toThrow(PermanentError);
  });

  it("names every missing placeholder in the error", () => {
    expect(() => renderer.render("{{a}} {{b}}", {})).toThrow(/a, b/);
  });

  it("treats a null value as missing rather than printing 'null'", () => {
    expect(() => renderer.render("{{name}}", { name: null })).toThrow(PermanentError);
  });

  it("refuses to inline an object rather than emitting [object Object]", () => {
    expect(() => renderer.render("{{payload}}", { payload: { a: 1 } })).toThrow(
      PermanentError,
    );
  });

  it("leaves text without placeholders untouched", () => {
    expect(renderer.render("No placeholders here", {})).toBe("No placeholders here");
  });

  it("reports missing placeholders without throwing", () => {
    expect(renderer.findMissingPlaceholders("{{a}} {{b}}", { a: 1 })).toEqual(["b"]);
  });
});
