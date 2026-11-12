"use client";

import { usePalette } from "@/components/PaletteProvider";
import { PALETTES } from "@/lib/palettes";
import "./palette-picker.css";

export function PalettePicker() {
  const { palette, setPalette, saved } = usePalette();
  const selected = PALETTES.find((item) => item.id === palette)!;
  return (
    <section className="card p-6 mb-6" aria-labelledby="appearance-heading">
      <div className="palette-heading"><h2 id="appearance-heading" className="font-display text-lg font-bold">Appearance</h2><span aria-live="polite">{selected.name}</span></div>
      <fieldset className="palette-options">
        <legend className="sr-only">Site color palette</legend>
        {PALETTES.map((item) => (
          <label className="palette-option" key={item.id}>
            <input type="radio" name="palette" value={item.id} checked={palette === item.id} onChange={() => setPalette(item.id)} />
            <span className="palette-sample" style={{ background: item.colors[0] }} aria-hidden="true"><span className="palette-sample-panel" style={{ background: item.colors[1] }}><span className="palette-sample-line" /><span className="palette-sample-line is-short" /><span className="palette-sample-button" style={{ background: item.colors[2] }} /></span><span className="palette-swatch" style={{ background: item.colors[2] }} /></span>
            <span className="palette-name">{item.name}<i className="fa-solid fa-check" aria-hidden="true" /></span>
          </label>
        ))}
      </fieldset>
      <p className="palette-note" role="status">{saved ? "Saved on this device." : "Applied for now. Your browser couldn't save this preference."}</p>
    </section>
  );
}
