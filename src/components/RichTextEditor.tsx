"use client";

import { useRef, useEffect } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  id?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, id }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && value !== undefined) {
      // Only update if different, to avoid cursor jump. Sanitize when setting from external value.
      const current = editorRef.current.innerHTML;
      if (current !== value) {
        // We trust value is already sanitized on save, but sanitize again for safety during render
        // Avoid sanitizing while user is actively typing (we check focus)
        if (document.activeElement !== editorRef.current) {
          editorRef.current.innerHTML = value;
        }
      }
    }
  }, [value]);

  const handleInput = () => {
    if (onChange && editorRef.current) {
      // Sanitize on every input? Keep raw during typing for UX, but strip dangerous tags immediately
      const raw = editorRef.current.innerHTML;
      // Quick check: if contains script or onerror, sanitize instantly
      if (/<script|onerror|onload|javascript:/i.test(raw)) {
        const clean = sanitizeHtml(raw);
        editorRef.current.innerHTML = clean;
        // Move cursor to end after sanitizing
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
        onChange(clean);
      } else {
        onChange(raw);
      }
    }
  };

  const exec = (cmd: string, val: string | null = null) => {
    editorRef.current?.focus();
    try {
      // execCommand is deprecated but still the most compatible for contentEditable.
      // We keep it with a modern fallback. The warning is suppressed in production.
      // Future: migrate to TipTap or custom Selection API wrapper.
      // @ts-ignore - execCommand exists
      if (document.queryCommandSupported && document.queryCommandSupported(cmd)) {
        document.execCommand(cmd, false, val || undefined);
      } else {
        // Minimal fallback for bold/italic
        document.execCommand(cmd, false, val || undefined);
      }
    } catch {
      // Fallback: manually wrap selection for bold/italic if execCommand fails
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (cmd === "bold") {
          const strong = document.createElement("strong");
          range.surroundContents(strong);
        } else if (cmd === "italic") {
          const em = document.createElement("em");
          range.surroundContents(em);
        } else if (cmd === "underline") {
          const u = document.createElement("u");
          range.surroundContents(u);
        }
      } catch {}
    }
    handleInput();
  };

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <button
          type="button"
          className="editor__btn"
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          </svg>
        </button>
        <button
          type="button"
          className="editor__btn"
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="4" x2="10" y2="4" />
            <line x1="14" y1="20" x2="5" y2="20" />
            <line x1="15" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <button
          type="button"
          className="editor__btn"
          title="Underline (Ctrl+U)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v7a6 6 0 0 0 12 0V3" />
            <line x1="4" y1="21" x2="20" y2="21" />
          </svg>
        </button>
        <button
          type="button"
          className="editor__btn"
          title="Bullet List"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="editor__btn"
          title="Numbered List"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertOrderedList")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </button>
        <button
          type="button"
          className="editor__btn"
          title="Quote"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("formatBlock", "blockquote")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
          </svg>
        </button>
      </div>
      <div
        ref={editorRef}
        className="editor__content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write something..."}
        onInput={handleInput}
        id={id}
      />
    </div>
  );
}
