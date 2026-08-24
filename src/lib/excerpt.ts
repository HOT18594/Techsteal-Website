// Plain-text excerpt from markdown source — used for thread previews in
// the forum list (rendering full markdown there would be heavy and noisy).

export function markdownExcerpt(md: string, max = 160): string {
  const text = (md ?? "")
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/\|\|[^|]*\|\|/g, " ") // spoiler spans — a list preview must not reveal them
    .replace(/^\s*#{1,6}\s+/gm, "") // heading markers (any depth)
    .replace(/^\s*>\s?/gm, "") // quote markers
    .replace(/^\s*[-*]\s+/gm, "") // bullets
    .replace(/^\s*\d+[.)](?:\s+|$)/gm, "") // ordered markers ("1. x" and bare "2." lines)
    // Lines that carried only a marker + a number/punctuation fragment
    // (poll options pasted as "- 1" / "2.") would otherwise surface as
    // orphaned "1 2 2"-style token runs in the preview.
    .replace(/^\s*[\d\p{P}\s]*$/gmu, "")
    .replace(/(\*\*|~~|\|\|)/g, "") // leftover bold/strike/spoiler markers
    .replace(/[*_`]/g, "") // italic/inline code
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ") // hr
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
