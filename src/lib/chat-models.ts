// Models offered in the assistant's picker, ordered by how much reasoning they
// do (fast → deep). Chosen from measured OpenRouter telemetry, not vibes: the
// assistant is tool-driven, so a low tool-call and structured-output error rate
// matters more than a leaderboard score.
//
//   model                     tok/s   e2e P50   tool err   struct err
//   nemotron-3.5-super-vl       278     2.9 s      0.07%       2.2%
//   flint-v1.0                   78     6.6 s      0.57%         n/a
//   ernie-5.5-flash-preview      93     6.9 s      0.76%      20.9%
//
// Deliberately excluded: inclusionai/ling-3.2-flash (18 tok/s, 28 s median,
// 45.6% structured-output failures) and particle-1 (no longer free).
//
// `lib/ai.ts` builds its fallback cascade from this list, so the order here is
// also the order of last-resort fallbacks.

export const CHAT_MODELS = [
  {
    id: "nvidia/nemotron-3.5-super-vl:free",
    label: "Nemotron 3.5",
    tier: "Fast",
  },
  {
    id: "recursive/flint-v1.0:free",
    label: "Flint",
    tier: "Balanced",
  },
  {
    id: "baidu/ernie-5.5-flash-preview:free",
    label: "ERNIE 5.5",
    tier: "Deep",
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_CHAT_MODEL: ChatModelId = "nvidia/nemotron-3.5-super-vl:free";

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === "string" && CHAT_MODELS.some((model) => model.id === value);
}

export function chatModelLabel(id: string): string {
  return CHAT_MODELS.find((model) => model.id === id)?.label ?? "Default";
}
