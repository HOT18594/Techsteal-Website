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
    const m = /^https?:\/\/[^\s<>()]+/.exec(rest)!;
    return { kind: "autolink", len: m[0].length, url: m[0] };
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
          if ("`*~|[_!".includes(c) || src.slice(j).match(/^https?:\/\//)) break;
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

export function Markdown({ text }: { text: string }) {
  const src = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;

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
        <figure key={`f${key++}`} className="md-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img[2]} alt={img[1]} title={img[1] || undefined} loading="lazy" decoding="async" />
          {img[1] ? <figcaption>{img[1]}</figcaption> : null}
        </figure>
      );
      return;
    }
    blocks.push(
      <p key={`p${key++}`} className="md-p">
        {inlineNodes(joined, `p${key}`)}
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
        <div key={`code${key++}`} className="md-codeblock">
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
        <Tag key={`h${key++}`} className={`md-heading md-heading-${level}`}>
          {inlineNodes(heading[2], `h${key}`)}
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(para);
      para = [];
      blocks.push(<hr key={`hr${key++}`} className="md-hr" />);
      i++;
      continue;
    }

    // Blockquote (consecutive > lines merge).
    if (line.startsWith(">")) {
      flushParagraph(para);
      para = [];
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`q${key++}`} className="md-quote">
          {inlineNodes(quote.join("\n"), `q${key}`)}
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
        <ul key={`ul${key++}`} className="md-list">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `ul${key}-${n}`)}</li>
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
        <ol key={`ol${key++}`} className="md-list md-list-ordered">
          {items.map((item, n) => (
            <li key={n}>{inlineNodes(item, `ol${key}-${n}`)}</li>
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

  return <div className="md-body">{blocks}</div>;
}
