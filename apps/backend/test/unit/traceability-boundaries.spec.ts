import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("traceability architecture boundaries", () => {
  const modulesRoot = join(process.cwd(), "src", "modules");

  it("keeps strategy domain source independent of cross-domain and traceability modules", () => {
    const forbidden = /from\s+["'][^"']*(?:execution|registry|performance|traceability)[^"']*["']/;
    const violations = sourceFiles(join(modulesRoot, "strategy")).flatMap((file) =>
      forbidden.test(readFileSync(file, "utf8")) ? [relative(process.cwd(), file)] : [],
    );
    expect(violations).toEqual([]);
  });

  it("keeps the traceability aggregator Prisma-only rather than importing domain services", () => {
    const file = join(modulesRoot, "traceability", "traceability-read.service.ts");
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*modules\/(?:strategy|execution|registry|performance)/);
    expect(source).not.toMatch(/from\s+["']\.\.\/(?:strategy|execution|registry|performance)/);
    expect(source).toContain('from "../../database/prisma.service"');
  });
});
