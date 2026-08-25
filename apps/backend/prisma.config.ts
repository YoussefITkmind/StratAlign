import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts && tsx prisma/seed-balanced-scorecards.ts && tsx prisma/seed-strategy-maps.ts",
  },
  datasource: {
    // Use process.env directly (not prisma/config's `env()` helper) so this
    // config file doesn't throw when DATABASE_URL is unset, e.g. during
    // `prisma generate` in a build step that has no DB connectivity.
    url: process.env.DATABASE_URL,
  },
});