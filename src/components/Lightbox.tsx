"use client";

import { useState, useEffect } from "react";

interface LightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
}

export default function Lightbox({ images, index, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    setCurrent(index);
  }, [index]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((c) => (c - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setCurrent((c) => (c + 1) % images.length);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  if (!images.length) return null;

  return (
    <div className="lightbox open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lightbox__close" onClick={onClose}>×</button>
      {images.length > 1 && (
        <button
          className="lightbox__nav lightbox__nav--prev"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + images.length) % images.length); }}
        >‹</button>
      )}
      <img src={images[current]} alt="" />
      {images.length > 1 && (
        <button
          className="lightbox__nav lightbox__nav--next"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % images.length); }}
        >›</button>
      )}
      {images.length > 1 && (
        <div className="lightbox__counter">{current + 1} / {images.length}</div>
      )}
    </div>
  );
}
