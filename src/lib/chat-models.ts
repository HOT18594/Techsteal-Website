export const CHAT_MODELS = [
  {
    id: "poolside/laguna-s-2.1:free",
    label: "Laguna 2.1",
    description: "Suggested · balanced and capable",
    suggested: true,
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning",
    description: "Fast responses",
    suggested: false,
  },
  {
    id: "minimax/minimax-m3:free",
    label: "MiniMax M3",
    description: "Strong general fallback",
    suggested: false,
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_CHAT_MODEL: ChatModelId = CHAT_MODELS[0].id;

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === "string" && CHAT_MODELS.some((model) => model.id === value);
}

