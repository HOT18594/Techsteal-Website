import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local env so `npm run db:generate` / `npm run db:push` work from .env.local
config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
