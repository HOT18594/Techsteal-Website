"use client";

// Rich markdown editor used by the forum composer, reply box and gallery
// description. Zero dependencies: a styled <textarea> plus a toolbar that
// wraps/inserts markdown tokens, a live preview tab (same renderer the
// posts render with), and image embedding — pick, paste, or drag a file and
// it uploads to Supabase Storage via /api/upload and drops the markdown in.

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Markdown } from "./Markdown";
import { compressImage } from "@/lib/imaging";

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Hard cap enforced by the API (the counter warns near it). */
  maxLength?: number;
  /** Textarea rows in Write mode. */
  rows?: number;
  disabled?: boolean;
  /** Hide the toolbar (e.g. tiny editors) — preview still available. */
  simple?: boolean;
  /** Unique id prefix so multiple editors on one page don't clash. */
  idPrefix: string;
  className?: string;
}

interface ToolButton {
  icon: string;
  label: string;
  run: (wrap: (before: string, after?: string, placeholder?: string) => void, line: (prefix: string) => void) => void;
  key?: string;
}

const TOOLS: ToolButton[] = [
  {
    icon: "fa-bold",
    label: "Bold (**text**)",
    key: "b",
    run: (wrap) => wrap("**", "**", "bold text"),
  },
  {
    icon: "fa-italic",
    label: "Italic (*text*)",
    key: "i",
    run: (wrap) => wrap("*", "*", "italic text"),
  },
  {
    icon: "fa-strikethrough",
    label: "Strikethrough (~~text~~)",
    run: (wrap) => wrap("~~", "~~", "struck text"),
  },
  { icon: "fa-heading", label: "Heading (line start #)", run: (_w, line) => line("# ") },
  {
    icon: "fa-list-ul",
    label: "Bullet list",
    run: (_w, line) => line("- "),
  },
  {
    icon: "fa-list-ol",
    label: "Numbered list",
    run: (_w, line) => line("1. "),
  },
  { icon: "fa-quote-left", label: "Quote (line start >)", run: (_w, line) => line("> ") },
  {
    icon: "fa-code",
    label: "Inline code (`text`)",
    run: (wrap) => wrap("`", "`", "code"),
  },
  {
    icon: "fa-square-code",
    label: "Code block (```)",
    run: (wrap) => wrap("\n```\n", "\n```\n", "// code"),
  },
  {
    icon: "fa-eye-slash",
    label: "Spoiler (||text||)",
    run: (wrap) => wrap("||", "||", "spoiler"),
  },
  { icon: "fa-link", label: "Link", key: "k", run: (wrap) => wrap("[", "](https://)", "link text") },
  { icon: "fa-grip-lines", label: "Divider (---)", run: (wrap) => wrap("", "\n\n---\n\n") },
];

export function RichEditor({
  value,
  onChange,
  placeholder,
  maxLength = 20000,
  rows = 8,
  disabled = false,
  simple = false,
  idPrefix,
  className = "",
}: RichEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(0); // uploads in flight
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /** Apply an edit to the textarea value, preserving/restoring selection. */
  const applyEdit = useCallback(
    (fn: (args: { value: string; start: number; end: number }) => { next: string; selStart: number; selEnd: number }) => {
      const ta = taRef.current;
      if (!ta || disabled) return;
      const { next, selStart, selEnd } = fn({
        value: ta.value,
        start: ta.selectionStart,
        end: ta.selectionEnd,
      });
      const capped = next.length > maxLength ? next.slice(0, maxLength) : next;
      onChange(capped);
      // Selection is restored after React re-renders the new value.
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(selStart, selEnd);
      });
    },
    [disabled, maxLength, onChange]
  );

  const wrapSelection = useCallback(
    (before: string, after = "", placeholderText = "") => {
      applyEdit(({ value, start, end }) => {
        const selected = value.slice(start, end);
        const inner = selected || placeholderText;
        return {
          next: value.slice(0, start) + before + inner + after + value.slice(end),
          selStart: start + before.length,
          selEnd: start + before.length + inner.length,
        };
      });
    },
    [applyEdit]
  );

  /** Prefix the current line (heading/list/quote toggling). */
  const prefixLine = useCallback(
    (prefix: string) => {
      applyEdit(({ value, start, end }) => {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const nl = value.indexOf("\n", end);
        const lineEnd = nl === -1 ? value.length : nl;
        const block = value.slice(lineStart, lineEnd);
        // Toggle: applying the same prefix again removes it.
        const stripped = block.replace(/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, "");
        const already = block.startsWith(prefix);
        const nextBlock = already ? stripped : prefix + stripped;
        const delta = nextBlock.length - block.length;
        return {
          next: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
          selStart: Math.max(lineStart, start + delta),
          selEnd: end + delta,
        };
      });
    },
    [applyEdit]
  );

  const insertAtCursor = useCallback(
    (snippet: string) => {
      applyEdit(({ value, start, end }) => ({
        next: value.slice(0, start) + snippet + value.slice(end),
        selStart: start + snippet.length,
        selEnd: start + snippet.length,
      }));
    },
    [applyEdit]
  );

  // ------------------------------------------------------------------
  // Image upload — pick / paste / drop all funnel through here.
  // ------------------------------------------------------------------

  const uploadFile = useCallback(
    async (file: File) => {
      if (disabled || uploading >= 4) return;
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        throw new Error("Only JPG, PNG, WebP and GIF images can be embedded.");
      }
      setUploading((n) => n + 1);
      setUploadPct(0);
      try {
        // Downscale/compress in the browser first — screenshots straight out
        // of Minecraft are often 3–8 MB PNGs for no visual benefit.
        const compressed = await compressImage(file, 1920, 0.85);
        const url = await xhrUpload(compressed, setUploadPct);
        insertAtCursor(`\n![${compressed.name.replace(/[^\w.-]/g, "").slice(0, 60) || "image"}](${url})\n`);
      } finally {
        setUploadPct(null);
        setUploading((n) => Math.max(0, n - 1));
      }
    },
    [disabled, insertAtCursor, uploading]
  );

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void uploadFile(file).catch(() => undefined);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) void uploadFile(file).catch(() => undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b" || key === "i" || key === "k") {
      e.preventDefault();
      const tool = TOOLS.find((t) => t.key === key);
      tool?.run(wrapSelection, prefixLine);
    }
  };

  const counter = maxLength - value.length;

  return (
    <div
      className={`rich-editor ${className}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Tab bar: Write / Preview + toolbar */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1">
          {!simple ? (
            <div className="flex items-center gap-0.5 flex-wrap" role="toolbar" aria-label="Formatting">
              {TOOLS.map((t) => (
                <button
                  key={t.icon}
                  type="button"
                  className="rich-tool"
                  title={t.label}
                  aria-label={t.label}
                  disabled={disabled || mode === "preview"}
                  onClick={() => t.run(wrapSelection, prefixLine)}
                >
                  <i className={`fa-solid ${t.icon}`} />
                </button>
              ))}
              <button
                type="button"
                className="rich-tool"
                title="Embed image — click, paste, or drag one in"
                aria-label="Embed image"
                disabled={disabled || mode === "preview"}
                onClick={() => fileRef.current?.click()}
              >
                <i className="fa-solid fa-image" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {uploading > 0 || uploadPct !== null ? (
            <span className="text-[11px] text-[var(--accent)] flex items-center gap-1.5" aria-live="polite">
              <i className="fa-solid fa-spinner fa-spin" />
              {uploadPct !== null ? `Uploading ${uploadPct}%` : "Compressing…"}
            </span>
          ) : null}
          <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden text-xs">
            {(["write", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`px-2.5 py-1 capitalize transition ${
                  mode === m
                    ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "write" ? (
        <div className={`relative ${dragOver ? "rich-editor-drag" : ""}`}>
          <textarea
            ref={taRef}
            id={`${idPrefix}-textarea`}
            className="rich-textarea"
            rows={rows}
            placeholder={placeholder ?? "Write something… **bold**, *italic*, `code`, ||spoilers|| — paste or drag images straight in."}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            aria-label="Post content (markdown)"
          />
          {dragOver ? (
            <div className="rich-editor-drop-overlay">
              <i className="fa-solid fa-cloud-arrow-up" />
              Drop to embed
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rich-preview" aria-label="Preview">
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <p className="text-sm text-[var(--muted-2)]">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[11px] text-[var(--muted-2)]">
          Markdown · <kbd className="rich-kbd">Ctrl+B</kbd> <kbd className="rich-kbd">Ctrl+I</kbd>{" "}
          <kbd className="rich-kbd">Ctrl+K</kbd> · paste/drag to embed
        </span>
        {counter < 500 ? (
          <span className={`text-[11px] ${counter < 0 ? "text-[var(--redstone)]" : "text-[var(--muted-2)]"}`}>
            {counter.toLocaleString()} left
          </span>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f).catch(() => undefined);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Upload with real progress events (fetch has none for request bodies). */
function xhrUpload(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set("image", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
        else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(body);
  });
}
