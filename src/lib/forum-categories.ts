// Per-category tag colors — one accent per category so the forum list and
// thread pages scan fast. Shared by the forum index and thread detail.

export const CATEGORY_LIST = [
  "General",
  "Announcements",
  "Ideas",
  "Builds",
  "Redstone",
  "Technical",
  "Off-topic",
] as const;

const CATEGORY_STYLES: Record<string, string> = {
  General: "text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--accent)]/10",
  Announcements: "text-[#ffd166] border-[#ffd166]/40 bg-[#ffd166]/10",
  Ideas: "text-[var(--diamond)] border-[var(--diamond)]/40 bg-[var(--diamond)]/10",
  Builds: "text-[var(--emerald)] border-[var(--emerald)]/40 bg-[var(--emerald)]/10",
  Redstone: "text-[var(--redstone)] border-[var(--redstone)]/40 bg-[var(--redstone)]/10",
  Technical: "text-[#6ee7ff] border-[#6ee7ff]/40 bg-[#6ee7ff]/10",
  "Off-topic": "text-[var(--muted)] border-[var(--border-strong)] bg-white/5",
};

export function categoryClass(category: string): string {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.General;
}
