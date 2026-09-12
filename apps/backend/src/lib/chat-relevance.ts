export type ChatRelevanceCategory = "relevant" | "advice" | "off_topic";

export const PERSONALIZED_ADVICE_REDIRECT =
  "I can explain what this event means, but I can't advise on your own position — that's outside what this tool does.";

const OFF_TOPIC_VARIANTS = [
  "I can only answer questions about this specific signal's research and data. Try asking about its sources, its severity rating, or which commodities it affects.",
  "That sits outside this signal. Ask about what happened, why it was flagged, or which instruments were named.",
  "I'm here for this briefing only — its evidence, severity, and listed impacts. Try a question about those.",
] as const;

const LETTERS = /[a-z]/gi;
const ADVICE_SHAPE =
  /\b(should i (buy|sell|add|hold|exit|close)|given my .{0,80}(position|portfolio|holding|shares?|barrels?|contracts?)|i (hold|have|bought) \d|what should i do|advise me|for my (account|portfolio|position))\b/i;
const INJECTION_SHAPE =
  /\b(ignore (all )?(previous|prior|above) instructions|reveal (your )?(system )?prompt|repeat your instructions|you are now|dan mode|jailbreak)\b/i;

export function pickOffTopicRedirect(seed: string): string {
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return OFF_TOPIC_VARIANTS[sum % OFF_TOPIC_VARIANTS.length] ?? OFF_TOPIC_VARIANTS[0];
}

export function heuristicChatRelevance(
  message: string,
  lastUserMessage?: string | null,
): ChatRelevanceCategory | null {
  const trimmed = message.trim();
  const letters = (trimmed.match(LETTERS) ?? []).length;
  if (trimmed.length === 0 || letters < 3) return "off_topic";
  if (/^[\s\p{P}\p{S}]+$/u.test(trimmed)) return "off_topic";
  if (lastUserMessage && trimmed.toLowerCase() === lastUserMessage.trim().toLowerCase()) {
    return "off_topic";
  }
  if (INJECTION_SHAPE.test(trimmed)) return "off_topic";
  if (ADVICE_SHAPE.test(trimmed)) return "advice";
  return null;
}

export function parseHaikuRelevanceLabel(raw: string): ChatRelevanceCategory {
  const token = raw
    .toLowerCase()
    .replace(/[^a-z_]+/g, " ")
    .trim()
    .split(/\s+/)[0];
  if (token === "advice" || token === "personalized" || token === "personalized_advice") {
    return "advice";
  }
  if (token === "relevant" || token === "a") return "relevant";
  return "off_topic";
}

export function fixedReplyForCategory(category: Exclude<ChatRelevanceCategory, "relevant">, seed: string): string {
  if (category === "advice") return PERSONALIZED_ADVICE_REDIRECT;
  return pickOffTopicRedirect(seed);
}
