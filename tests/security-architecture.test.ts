import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiSource = readFileSync(join(process.cwd(), "src/lib/api.ts"), "utf8");
const setupRoute = readFileSync(join(process.cwd(), "src/app/api/auth/setup/route.ts"), "utf8");
const homeSource = readFileSync(join(process.cwd(), "src/components/Home.tsx"), "utf8");

describe("security architecture guardrails", () => {
  it("does not perform privileged database mutations directly from the browser API helper", () => {
    expect(apiSource).not.toMatch(/\.from\("posts"\)\s*\.insert/);
    expect(apiSource).not.toMatch(/\.from\("posts"\)\s*\.update/);
    expect(apiSource).not.toMatch(/\.from\("posts"\)\s*\.delete/);
    expect(apiSource).not.toMatch(/\.from\("comments"\)\s*\.insert/);
    expect(apiSource).not.toMatch(/\.from\("comments"\)\s*\.delete/);
    expect(apiSource).not.toMatch(/\.from\("blog_posts"\)\s*\.insert/);
    expect(apiSource).not.toMatch(/\.from\("blog_posts"\)\s*\.update/);
    expect(apiSource).not.toMatch(/\.from\("blog_posts"\)\s*\.delete/);
    expect(apiSource).not.toMatch(/\.from\("seasons"\)\s*\.update/);
  });

  it("does not let browser callers submit authoritative Discord identities to like RPCs", () => {
    expect(apiSource).not.toContain('rpc("toggle_post_like"');
    expect(apiSource).not.toContain('rpc("toggle_comment_like"');
    expect(apiSource).not.toContain('rpc("my_liked_post_ids"');
    expect(apiSource).not.toContain('rpc("my_liked_comment_ids"');
  });

  it("does not accept unsigned legacy JSON session cookies in setup", () => {
    expect(setupRoute).not.toContain("JSON.parse(raw)");
    expect(setupRoute).not.toContain("legacy");
  });

  it("does not expose removed server-control unlock-code UI", () => {
    expect(homeSource).not.toContain("unlockCode");
    expect(homeSource).not.toContain("Unlock with code");
    expect(homeSource).not.toContain("server control code");
  });
});
