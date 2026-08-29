"use client";

// Safe Markdown renderer for forum posts, replies and gallery descriptions.
//
// Renders straight to React nodes — never dangerouslySetInnerHTML — so raw
// HTML in user content is shown as literal text (React escapes it) instead
// of executing. Supported syntax:
//   # / ## / ### headings        **bold**   *italic*   ~~strike~~
//   `inline code`                ```lang … ``` fenced code blocks
//   > blockquotes                - / * bullets   1. numbered lists
//   --- / *** horizontal rules   [text](https://…) links (http/https only)
//   ![alt](https://…/img.png) images   [![alt](img)](url) clickable thumbnails
//   ||spoiler|| (click to reveal)     bare https://… URLs autolink

import { Fragment, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// URL safety — links and images may only point at http(s) resources.
// ---------------------------------------------------------------------------

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

type InlineScan =
  | { kind: "text"; len: number }
  | { kind: "bold" | "italic" | "strike" | "spoiler" | "code"; len: number }
  | { kind: "bolditalic"; len: number; innerStart: number; innerEnd: number }
  | { kind: "link"; len: number; url: string; text: string }
  | { kind: "image"; len: number; url: string; alt: string }
  | { kind: "imagelink"; len: number; url: string; imageUrl: string; alt: string }
  | { kind: "autolink"; len: number; url: string };

// Link/image targets allow ONE level of balanced parentheses so Wikipedia
// style URLs ([x](https://en.wikipedia.org/wiki/X_(y))) survive intact — a
// plain lazy `\S+?` stops at the first `)` inside the URL.
const LINK_TARGET = "((?:[^()\\s]|\\([^()]*\\))+)(?:\\s+\"[^\"]*\")?";
const MD_IMAGE_RE = new RegExp(`^!\\[([^\\]]*)\\]\\(${LINK_TARGET}\\)`);
const MD_LINK_RE = new RegExp(`^\\[([^\\]]*)\\]\\(${LINK_TARGET}\\)`);
// A clickable thumbnail: [![alt](img)](href). The nested ]( pairs defeat the
// flat link regex above ([^\]]* stops at the image's own closing bracket),
// which used to truncate mid-URL and leak literal markup.
const MD_IMAGE_LINK_RE = new RegExp(
  `^\\[!\\[([^\\]]*)\\]\\(${LINK_TARGET}\\)\\]\\(${LINK_TARGET}\\)`
);

/** Match one inline token starting at `i`, or a plain-text run. */
function scanInline(src: string, i: number): InlineScan {
  const rest = src.slice(i);
  const at = (offset: number) => src[i + offset];

  // Inline code: `…` to the next backtick on the same paragraph.
  if (at(0) === "`") {
    const close = src.indexOf("`", i + 1);
    if (close > i + 1) return { kind: "code", len: close - i + 1 };
    return { kind: "text", len: 1 };
  }

  // Image ![alt](url) — must be checked before plain links.
  if (rest.startsWith("![") && safeUrl(MD_IMAGE_RE.exec(rest)?.[2] ?? "")) {
    const m = MD_IMAGE_RE.exec(rest)!;
    return { kind: "image", len: m[0].length, url: m[2], alt: m[1] };
  }

  // Link [text](url)
  if (at(0) === "[") {
    // Clickable thumbnail form first — its nested brackets would otherwise
    // be swallowed by the flat link match below. Groups: 1=alt, 2=img URL,
    // 3=outer URL (the optional `"title"` tails are non-capturing).
    const il = MD_IMAGE_LINK_RE.exec(rest);
    if (il && safeUrl(il[2]) && safeUrl(il[3])) {
      return { kind: "imagelink", len: il[0].length, url: il[3], imageUrl: il[2], alt: il[1] };
    }
    const m = MD_LINK_RE.exec(rest);
    if (m && safeUrl(m[2])) {
      return { kind: "link", len: m[0].length, url: m[2], text: m[1] };
    }
    return { kind: "text", len: 1 };
  }

  // Bold+italic — a run of 3+ asterisks (***…***, ****…****). Checked before
  // plain ** so the whole run is consumed; extra asterisks on either end are
  // absorbed into the delimiters instead of leaking as stray "*" text.
  if (rest.startsWith("***")) {
    let openRun = 0;
    while (at(openRun) === "*") openRun++;
    const close = src.indexOf("***", i + openRun);
    if (close > i + openRun && close + 3 <= src.length) {
      let end = close + 3;
      while (src[end] === "*") end++;
      return { kind: "bolditalic", len: end - i, innerStart: i + openRun, innerEnd: close };
    }
  }

  // Bold **…** / spoiler ||…|| / strike ~~…~~ — all "wrap until delimiter".
  for (const [token, kind] of [
    ["**", "bold"],
    ["~~", "strike"],
    ["||", "spoiler"],
  ] as const) {
    if (rest.startsWith(token)) {
      const close = src.indexOf(token, i + token.length);
      // Non-empty content, closed on the same inline run.
      if (close > i + token.length) return { kind, len: close - i + token.length };
    }
  }

  // Italic *…* (single) — but not inside words like `2*3*4` (require a
  // non-word char before, or start of string).
  if (at(0) === "*" && (i === 0 || !/\w/.test(src[i - 1]))) {
    const close = src.indexOf("*", i + 1);
    if (close > i + 1 && src[close + 1] !== "*") {
      return { kind: "italic", len: close - i + 1 };
    }
    return { kind: "text", len: 1 };
  }

  // Autolink bare http(s) URLs.
  if (rest.match(/^https?:\/\/\S/)) {
    const m = /^https?:\/\/[^\s<>]+/.exec(rest)!;
    let url = m[0];
    // Parens/brackets may be PART of a URL (Wikipedia: …/X_(y)) — only trim
    // closing brackets that don't have a matching opener, so
    // "https://en.wikipedia.org/wiki/X_(disambiguation)" survives intact.
    while (/[)\]}]/.test(url.slice(-1))) {
      const opens = (url.match(/[{[(]/g) ?? []).length;
      const closes = (url.match(/[}\])]/g) ?? []).length;
      if (closes > opens) url = url.slice(0, -1);
      else break;
    }
    // Sentence punctuation after a URL is prose, not part of it
    // ("see https://example.com.") — leave it as text outside the link.
    url = url.replace(/[.,!?;:'"'…]+$/, "");
    if (!url) return { kind: "text", len: 1 };
    return { kind: "autolink", len: url.length, url };
  }

  return { kind: "text", len: 1 };
}

/** Strip markdown tokens from a string (used for list markers etc.). */
function inlineNodes(src: string, keyPrefix: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (node: ReactNode, len: number, kind: string) => {
    out.push(<Fragment key={`${keyPrefix}-${kind}-${key++}`}>{node}</Fragment>);
    i += len;
  };

  while (i < src.length) {
    const tok = scanInline(src, i);
    switch (tok.kind) {
      case "text": {
        // Coalesce the whole plain-text run until the next special char.
        // `_` is deliberately NOT a break char: no scanInline branch handles
        // it (underscore emphasis is unsupported on purpose so snake_case
        // identifiers survive), so breaking on it only split every run into
        // one-char fragments. `___` rules are matched at the block level.
        let j = i + 1;
        while (j < src.length) {
          const c = src[j];
          // startsWith(offset form) — no per-position substring copy.
          if (
            "`*~|[!".includes(c) ||
            ((c === "h" && (src.startsWith("http://", j) || src.startsWith("https://", j))))
          )
            break;
          j++;
        }
        push(src.slice(i, j), j - i, "t");
        break;
      }
      case "bold": {
        const inner = src.slice(i + 2, i + tok.len - 2);
        push(<strong>{inlineNodes(inner, `${keyPrefix}-b${key}`, depth + 1)}</strong>, tok.len, "b");
        break;
      }
      case "bolditalic": {
        const inner = src.slice(tok.innerStart, tok.innerEnd);
        push(
          <strong>
            <em>{inlineNodes(inner, `${keyPrefix}-bi${key}`, depth + 1)}</em>
          </strong>,
          tok.len,
          "bi"
        );
        break;
      }
      case "italic": {
        const inner = src.slice(i + 1, i + tok.len - 1);
        push(<em>{inlineNodes(inner, `${keyPrefix}-i${key}`, depth + 1)}</em>, tok.len, "i");
        break;
      }
      case "strike": {
        const inner = src.slice(i + 2, i + tok.len - 2);
        push(<s>{inlineNodes(inner, `${keyPrefix}-s${key}`, depth + 1)}</s>, tok.len, "s");
        break;
      }
      case "code":
        push(
          <code className="md-code">{src.slice(i + 1, i + tok.len - 1)}</code>,
          tok.len,
          "c"
        );
        break;
      case "spoiler": {
        const inner = src.slice(i + 2, i + tok.len - 2);
        // Spoilers parse their contents like every other wrapper — nested
        // bold/links/spoilers render as markdown, not literal markers.
        push(<Spoiler>{inlineNodes(inner, `${keyPrefix}-sp${key}`, depth + 1)}</Spoiler>, tok.len, "sp");
        break;
      }
      case "link":
        push(
          <a href={tok.url} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
            {/* The label parses as inline markdown too — [**bold**](url)
                used to show its literal asterisks. Labels can't contain
                another [link](…) (the capture excludes `]`), so this
                recursion is naturally one level deep. */}
            {tok.text ? inlineNodes(tok.text, `${keyPrefix}-l${key}`, depth + 1) : tok.url}
          </a>,
          tok.len,
          "l"
        );
        break;
      case "imagelink":
        push(
          <a href={tok.url} target="_blank" rel="noopener noreferrer nofollow" className="md-imagelink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tok.imageUrl}
              alt={tok.alt}
              loading="lazy"
              decoding="async"
              className="md-image"
            />
          </a>,
          tok.len,
          "il"
        );
        break;
      case "autolink":
        push(
          <a href={tok.url} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
            {tok.url}
          </a>,
          tok.len,
          "al"
        );
        break;
      case "image":
        push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tok.url}
            alt={tok.alt}
            title={tok.alt || undefined}
            loading="lazy"
            decoding="async"
            className="md-image"
          />,
          tok.len,
          "im"
        );
        break;
    }
  }
  return out;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`md-spoiler ${revealed ? "revealed" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={revealed}
      title={revealed ? undefined : "Spoiler — click to reveal"}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed(true);
        }
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

const IMAGE_ONLY = new RegExp(`^!\\[([^\\]]*)\\]\\(${LINK_TARGET}\\)\\s*$`);

/** Max blockquote nesting depth — quotes-in-quotes recurse through
 * parseBlocks, and a pathological ">>>>>>…" line must not recurse per char. */
const MAX_QUOTE_DEPTH = 8;

/** Optional replacement for the default fenced-code-block rendering.
 *  Chatty Jr. supplies one so its blocks keep their Copy button; forum
 *  content uses the plain default. */
export type CodeBlockRenderer = (props: { code: string; lang?: string }) => ReactNode;

export function Markdown({
  text,
  className = "md-body",
  codeBlock,
}: {
  text: string;
  /** Root class — chat bubbles pass their own wrapper class. */
  className?: string;
  codeBlock?: CodeBlockRenderer;
}) {
  const src = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  return <div className={className}>{parseBlocks(src, "md", 0, codeBlock)}</div>;
}

/** Parse one markdown document (or quote body) into block-level nodes. */
function parseBlocks(
  src: string,
  keyPrefix: string,
  depth = 0,
  codeBlock?: CodeBlockRenderer
): ReactNode[] {
  const lines = src.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (para: string[]) => {
    if (para.length === 0) return;
    const joined = para.join("\n").trim();
    // One id per block, captured BEFORE the counter moves: writing `key++` in
    // the key and then reading `key` for the inline prefix gave the inline
    // fragments the *next* block's number, so two sibling blocks handed the
    // same prefix to their children.
    const id = key++;
    // A paragraph that is exactly one image becomes a standalone figure.
    const img = IMAGE_ONLY.exec(joined);
    if (img && safeUrl(img[2])) {
      blocks.push(
        <figure key={`${keyPrefix}-f${id}`} className="md-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img[2]} alt={img[1]} title={img[1] || undefined} loading="lazy" decoding="async" />
          {img[1] ? <figcaption>{img[1]}</figcaption> : null}
        </figure>
      );
      return;
    }
    blocks.push(
      <p key={`${keyPrefix}-p${id}`} className="md-p">
        {inlineNodes(joined, `${keyPrefix}-p${id}`)}
      </p>
    );
  };

  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block. An unterminated fence (the model is still streaming
    // its closing ```) renders what has arrived so far rather than swallowing
    // the rest of the message.
    if (line.startsWith("```")) {
      flushParagraph(para);
      para = [];
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      const code = body.join("\n");
      const id = key++;
      blocks.push(
        codeBlock ? (
          <Fragment key={`${keyPrefix}-code${id}`}>{codeBlock({ code, lang: lang || undefined })}</Fragment>
        ) : (
          <div key={`${keyPrefix}-code${id}`} className="md-codeblock">
            {lang ? <span className="md-codeblock-lang">{lang}</span> : null}
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        )
      );
      continue;
    }

    // Heading.
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(para);
      para = [];
      const level = heading[1].length;
      const id = key++;
      const Tag = (level === 1 ? "h3" : level === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
      blocks.push(
        <Tag key={`${keyPrefix}-h${id}`} className={`md-heading md-heading-${level}`}>
          {inlineNodes(heading[2], `${keyPrefix}-h${id}`)}
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(para);
      para = [];
      blocks.push(<hr key={`${keyPrefix}-hr${key++}`} className="md-hr" />);
      i++;
      continue;
    }

    // Blockquote (consecutive > lines merge). The stripped body is parsed
    // as full markdown — lists, headings and code inside quotes render as
    // such instead of leaking literal markers.
    if (line.startsWith(">")) {
      flushParagraph(para);
      para = [];
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const id = key++;
      blocks.push(
        <blockquote key={`${keyPrefix}-q${id}`} className="md-quote">
          {depth < MAX_QUOTE_DEPTH
            ? parseBlocks(quote.join("\n"), `${keyPrefix}-q${id}`, depth + 1, codeBlock)
            : inlineNodes(quote.join("\n"), `${keyPrefix}-q${id}d`)}
        </blockquote>
      );
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(para);
      para = [];
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      const id = key++;
      blocks.push(
        <ul key={`${keyPrefix}-ul${id}`} className="md-list">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `${keyPrefix}-ul${id}-${n}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph(para);
      para = [];
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      const id = key++;
      blocks.push(
        <ol key={`${keyPrefix}-ol${id}`} className="md-list md-list-ordered">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `${keyPrefix}-ol${id}-${n}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line ends the paragraph.
    if (line.trim() === "") {
      flushParagraph(para);
      para = [];
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flushParagraph(para);

  return blocks;
}
