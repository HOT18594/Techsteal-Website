// Models offered in the assistant's picker, ordered fast → smart.
// The picker shows the name plus a one-word tier; it never advertises
// pricing or provider tier. `DEFAULT_CHAT_MODEL` is the balanced choice.
//
// `lib/ai.ts` builds its fallback cascade from this list, so adding a model
// here also makes it a last-resort fallback for every conversation.

export const CHAT_MODELS = [
  {
    id: "nvidia/nemotron-3.5-super-vl:free",
    label: "Nemotron 3.5",
    tier: "Fast",
  },
  {
    id: "inclusionai/ling-3.2-flash:free",
    label: "Ling 3.2",
    tier: "Balanced",
  },
  {
    id: "particle-ai/particle-1:free",
    label: "Particle-1",
    tier: "Deep",
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_CHAT_MODEL: ChatModelId = "inclusionai/ling-3.2-flash:free";

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === "string" && CHAT_MODELS.some((model) => model.id === value);
}

export function chatModelLabel(id: string): string {
  return CHAT_MODELS.find((model) => model.id === id)?.label ?? "Default";
}
