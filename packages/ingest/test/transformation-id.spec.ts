import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTransformationId } from "../src";

describe("getTransformationId", () => {
  it("is stable and changes with SQL or declared version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "spm-transform-"));
    const sql = join(directory, "example.sql");
    const metadata = join(directory, "example.metadata.json");
    await writeFile(sql, "SELECT 1;");
    await writeFile(metadata, JSON.stringify({ version: "1", description: "test", expectedOutputColumns: ["value"] }));
    const first = await getTransformationId(sql);
    expect(await getTransformationId(sql)).toBe(first);
    await writeFile(sql, "SELECT 2;");
    expect(await getTransformationId(sql)).not.toBe(first);
    await writeFile(sql, "SELECT 1;");
    await writeFile(metadata, JSON.stringify({ version: "2", description: "test", expectedOutputColumns: ["value"] }));
    expect(await getTransformationId(sql)).not.toBe(first);
  });
});
