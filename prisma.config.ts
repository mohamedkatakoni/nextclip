import process from "node:process";
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  // Environment variables may be supplied by GitHub Actions instead.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
