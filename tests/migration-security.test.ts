import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "SUPABASE_CANONICAL_SECURITY_MIGRATION.sql"), "utf8");
const serverControl = readFileSync(join(process.cwd(), "src/app/api/server/control/route.ts"), "utf8");
const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

describe("canonical security migration", () => {
  it("does not expose user_roles to public anon reads", () => {
    expect(migration).not.toMatch(/CREATE POLICY\s+"user_roles_read"[\s\S]*USING\s*\(true\)/i);
  });

  it("does not retain server-control bypass code references", () => {
    expect(serverControl).not.toContain("SERVER_CONTROL_CODE");
    expect(envExample).not.toContain("SERVER_CONTROL_CODE");
  });
});
