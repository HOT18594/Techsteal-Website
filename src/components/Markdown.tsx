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
//   ![alt](https://…/img.png) images   ||spoiler|| (click to reveal)
//   bare https://… URLs autolink

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
  | { kind: "bolditalic"; len: number }
  | { kind: "link"; len: number; url: string; text: string }
  | { kind: "image"; len: number; url: string; alt: string }
  | { kind: "autolink"; len: number; url: string };

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
  if (rest.startsWith("![")) {
    const m = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(rest);
    if (m && safeUrl(m[2])) {
      return { kind: "image", len: m[0].length, url: m[2], alt: m[1] };
    }
    return { kind: "text", len: 1 };
  }

  // Link [text](url)
  if (at(0) === "[") {
    const m = /^\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(rest);
    if (m && safeUrl(m[2])) {
      return { kind: "link", len: m[0].length, url: m[2], text: m[1] };
    }
    return { kind: "text", len: 1 };
  }

  // Bold+italic ***…*** — checked before plain ** so BOTH delimiters are
  // consumed; otherwise ***text*** renders bold "*text" plus a stray "*".
  if (rest.startsWith("***")) {
    const close = src.indexOf("***", i + 3);
    if (close > i + 3 && close + 3 <= src.length) {
      return { kind: "bolditalic", len: close - i + 3 };
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
        let j = i + 1;
        while (j < src.length) {
          const c = src[j];
          // startsWith(offset form) — no per-position substring copy.
          if (
            "`*~|[_!".includes(c) ||
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
        const inner = src.slice(i + 3, i + tok.len - 3);
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
        push(<Spoiler>{inner}</Spoiler>, tok.len, "sp");
        break;
      }
      case "link":
        push(
          <a href={tok.url} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
            {tok.text || tok.url}
          </a>,
          tok.len,
          "l"
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

const IMAGE_ONLY = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)\s*$/;

/** Max blockquote nesting depth — quotes-in-quotes recurse through
 * parseBlocks, and a pathological ">>>>>>…" line must not recurse per char. */
const MAX_QUOTE_DEPTH = 8;

export function Markdown({ text }: { text: string }) {
  const src = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  return <div className="md-body">{parseBlocks(src, "md")}</div>;
}

/** Parse one markdown document (or quote body) into block-level nodes. */
function parseBlocks(src: string, keyPrefix: string, depth = 0): ReactNode[] {
  const lines = src.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (para: string[]) => {
    if (para.length === 0) return;
    const joined = para.join("\n").trim();
    // A paragraph that is exactly one image becomes a standalone figure.
    const img = IMAGE_ONLY.exec(joined);
    if (img && safeUrl(img[2])) {
      blocks.push(
        <figure key={`${keyPrefix}-f${key++}`} className="md-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img[2]} alt={img[1]} title={img[1] || undefined} loading="lazy" decoding="async" />
          {img[1] ? <figcaption>{img[1]}</figcaption> : null}
        </figure>
      );
      return;
    }
    blocks.push(
      <p key={`${keyPrefix}-p${key++}`} className="md-p">
        {inlineNodes(joined, `${keyPrefix}-p${key}`)}
      </p>
    );
  };

  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
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
      blocks.push(
        <div key={`${keyPrefix}-code${key++}`} className="md-codeblock">
          {lang ? <span className="md-codeblock-lang">{lang}</span> : null}
          <pre>
            <code>{body.join("\n")}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Heading.
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(para);
      para = [];
      const level = heading[1].length;
      const Tag = (level === 1 ? "h3" : level === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
      blocks.push(
        <Tag key={`${keyPrefix}-h${key++}`} className={`md-heading md-heading-${level}`}>
          {inlineNodes(heading[2], `${keyPrefix}-h${key}`)}
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
      blocks.push(
        <blockquote key={`${keyPrefix}-q${key++}`} className="md-quote">
          {depth < MAX_QUOTE_DEPTH
            ? parseBlocks(quote.join("\n"), `${keyPrefix}-q${key}`, depth + 1)
            : inlineNodes(quote.join("\n"), `${keyPrefix}-q${key}d`)}
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
      blocks.push(
        <ul key={`${keyPrefix}-ul${key++}`} className="md-list">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `${keyPrefix}-ul${key}-${n}`)}</li>
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
      blocks.push(
        <ol key={`${keyPrefix}-ol${key++}`} className="md-list md-list-ordered">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `${keyPrefix}-ol${key}-${n}`)}</li>
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
