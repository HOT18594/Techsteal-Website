"use client";

// Rich markdown editor used by the forum composer, reply box and gallery
// description. Zero dependencies: a styled <textarea> plus a toolbar that
// wraps/inserts markdown tokens, a live preview tab (same renderer the
// posts render with), and image embedding — pick, paste, or drag a file and
// it uploads to Supabase Storage via /api/upload and drops the markdown in.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Markdown } from "./Markdown";
import { compressImage, MAX_UPLOAD_BYTES } from "@/lib/imaging";
import { xhrUpload } from "@/lib/xhr-upload";

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
  /** Called with a friendly message when an embed upload fails — the
   * editor itself only shows a spinner state, so hosts surface errors. */
  onUploadError?: (message: string) => void;
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

/** Which line-prefix family a string starts with, or null for none. Used to
 *  toggle list/heading/quote prefixes by KIND rather than exact text. */
function prefixKind(text: string): "heading" | "bullet" | "ordered" | "quote" | null {
  if (/^#{1,3}\s+/.test(text)) return "heading";
  if (/^[-*]\s+/.test(text)) return "bullet";
  if (/^\d+[.)]\s+/.test(text)) return "ordered";
  if (/^>\s?/.test(text)) return "quote";
  return null;
}

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
  onUploadError,
}: RichEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // In-flight embed uploads — aborted on unmount so a finished upload can't
  // fire toasts / insert into a torn-down editor.
  const inflightUploads = useRef<Set<XMLHttpRequest>>(new Set());
  useEffect(() => {
    const set = inflightUploads.current;
    return () => {
      for (const xhr of set) xhr.abort();
    };
  }, []);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(0); // uploads in flight
  // Ref counter for the in-flight cap — state reads inside async callbacks
  // are stale closures and let the cap slip.
  const uploadingCount = useRef(0);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  // Per-upload progress keyed by an incrementing id — up to four XHRs run
  // concurrently and writing all of them into one shared percentage made
  // the bar jump up and down ("37% → 92% → 15%"). We render their average.
  const progressRef = useRef<Map<number, number>>(new Map());
  const nextUploadId = useRef(0);
  const pushProgress = useCallback((id: number, pct: number) => {
    progressRef.current.set(id, pct);
    const vals = [...progressRef.current.values()];
    setUploadPct(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  }, []);
  const [dragOver, setDragOver] = useState(false);
  // Embeds that finished while Preview was open (textarea unmounted) —
  // inserted as soon as Write mode remounts the textarea. A QUEUE, not a
  // single slot: up to four uploads run concurrently, and two finishing in
  // the same render window would otherwise overwrite each other and
  // silently drop an uploaded image.
  const queuedInsert = useRef<string[]>([]);

  useEffect(() => {
    if (mode !== "write" || queuedInsert.current.length === 0) return;
    const snippets = queuedInsert.current;
    queuedInsert.current = [];
    requestAnimationFrame(() => {
      for (const snippet of snippets) insertAtCursor(snippet);
    });
    // insertAtCursor identity is stable (useCallback on applyEdit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      // Selection is restored after React re-renders the new value — clamped
      // to the capped length so a truncating edit can't set an out-of-range
      // caret (browsers clamp silently, but mid-token).
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(Math.min(selStart, capped.length), Math.min(selEnd, capped.length));
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
        // Compare the KIND of prefix, not the literal text: the numbered-list
        // button always sends "1. ", so a line already rendered as "2. " never
        // matched startsWith() and the toggle turned it into "1. 2. ".
        const already = prefixKind(block) !== null && prefixKind(block) === prefixKind(prefix);
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
      if (disabled) return;
      if (uploadingCount.current >= 4) {
        // Silently dropping the file here looked like the editor had simply
        // ignored the paste/drop.
        onUploadError?.("Four uploads are already running — wait for one to finish.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        onUploadError?.("Only JPG, PNG, WebP and GIF images can be embedded.");
        return;
      }
      // GIFs can't be recompressed without losing the animation, so their
      // size gate is the raw file. Everything else is measured AFTER
      // compression below — a 6 MB Minecraft screenshot usually lands a few
      // hundred KB, and rejecting it up front was needless.
      if (file.type === "image/gif" && file.size > MAX_UPLOAD_BYTES) {
        onUploadError?.(
          "GIFs must be under 4 MB (they can't be compressed without losing the animation)."
        );
        return;
      }
      uploadingCount.current += 1;
      setUploading(uploadingCount.current);
      const uploadId = ++nextUploadId.current;
      pushProgress(uploadId, 0);
      try {
        // Downscale/compress in the browser first — screenshots straight out
        // of Minecraft are often 3–8 MB PNGs for no visual benefit.
        const compressed = await compressImage(file, 1920, 0.85);
        if (compressed.size > MAX_UPLOAD_BYTES) {
          throw new Error("Images must be under 4 MB — try a smaller screenshot.");
        }
        const url = await xhrUpload(compressed, (pct) => pushProgress(uploadId, pct), inflightUploads.current);
        const snippet = `\n![${compressed.name.replace(/[^\w.-]/g, "").slice(0, 60) || "image"}](${url})\n`;
        if (taRef.current) {
          insertAtCursor(snippet);
        } else {
          // Preview tab is open (no textarea): queue the embed and flip back
          // to Write — previously this uploaded the file and silently
          // dropped it.
          queuedInsert.current.push(snippet);
          setMode("write");
        }
      } catch (e) {
        // An aborted upload (editor unmounted) is intentional cleanup, not
        // an error the user should hear about.
        if (e instanceof Error && e.message === "aborted") return;
        onUploadError?.(e instanceof Error ? e.message : "Upload failed — try again.");
      } finally {
        progressRef.current.delete(uploadId);
        uploadingCount.current = Math.max(0, uploadingCount.current - 1);
        setUploading(uploadingCount.current);
        if (uploadingCount.current === 0) {
          progressRef.current.clear();
          setUploadPct(null);
        }
      }
    },
    [disabled, insertAtCursor, onUploadError, pushProgress]
  );

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    // A clipboard holding text AND an image (rich copy from Word/Slack)
    // must keep its text — only hijack the paste when it's image-only.
    if (e.clipboardData.getData("text/plain").trim()) return;
    e.preventDefault();
    void uploadFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    // Only intercept FILE drags. Text drag-and-drop (moving a selection
    // inside the textarea, or dragging text in from elsewhere) must keep its
    // native behavior — preventDefault-ing it silently swallowed the move.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) void uploadFile(file);
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
        // The "Drop to embed" overlay is for image files only — text drags
        // keep their native affordance.
        if (!e.dataTransfer.types.includes("Files")) return;
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
          // `counter < 0` was unreachable: the textarea's own maxLength and
          // applyEdit's slice both cap the value at maxLength, so the count
          // bottoms out at exactly 0. Warn AT the cap instead — that's the
          // moment typing silently stops having any effect, which is what the
          // red text needs to explain.
          <span
            className={`text-[11px] ${counter <= 0 ? "text-[var(--redstone)]" : "text-[var(--muted-2)]"}`}
          >
            {counter <= 0 ? "Character limit reached" : `${counter.toLocaleString()} left`}
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
          if (f) void uploadFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
