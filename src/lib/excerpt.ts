// Plain-text excerpt from markdown source — used for thread previews in
// the forum list (rendering full markdown there would be heavy and noisy).

export function markdownExcerpt(md: string, max = 160): string {
  const text = (md ?? "")
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^\s*#{1,3}\s+/gm, "") // heading markers
    .replace(/^\s*>\s?/gm, "") // quote markers
    .replace(/^\s*[-*]\s+/gm, "") // bullets
    .replace(/^\s*\d+[.)]\s+/gm, "") // numbers
    .replace(/(\*\*|~~|\|\|)/g, "") // bold/strike/spoiler
    .replace(/[*_`]/g, "") // italic/inline code
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ") // hr
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
