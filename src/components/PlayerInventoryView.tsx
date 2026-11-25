"use client";

import { useMemo, useState } from "react";
import { MinecraftItemIcon, MinecraftSlot } from "@/components/MinecraftItem";
import { useToast } from "@/components/Toast";
import { MC_HUD_SPRITES, resolveMobEffectIcon } from "@/lib/mc-assets";
import type { DecodedItemStack, DecodedPlayerData } from "@/lib/mc-playerdata";
import { minotarUrl } from "@/lib/minotar";
import "./minecraft-inventory.css";

function formatEffectDuration(seconds: number, infinite: boolean): string {
  if (infinite) return "∞";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function itemMatchesQuery(item: DecodedItemStack | null, q: string): boolean {
  if (!item || !q) return false;
  if (item.id.toLowerCase().includes(q)) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.customName?.toLowerCase().includes(q)) return true;
  if (item.potionLabel?.toLowerCase().includes(q)) return true;
  if (item.enchantments.some((e) => e.label.toLowerCase().includes(q))) return true;
  if (item.storedEnchantments.some((e) => e.label.toLowerCase().includes(q))) return true;
  if (item.lore.some((l) => l.toLowerCase().includes(q))) return true;
  if (item.containerItems.some((child) => itemMatchesQuery(child, q))) return true;
  return false;
}

function HudIconBar({
  value,
  max,
  fullSprite,
  halfSprite,
  emptySprite,
  extraFullSprite,
  extraValue = 0,
  capIcons = 20,
}: {
  value: number;
  max: number;
  fullSprite: string;
  halfSprite: string;
  emptySprite: string;
  extraFullSprite?: string;
  extraValue?: number;
  capIcons?: number;
}) {
  const totalSlots = Math.min(capIcons, Math.max(1, Math.ceil(max / 2)));
  const icons: Array<{ key: string; src: string }> = [];
  for (let i = 0; i < totalSlots; i++) {
    const threshold = (i + 1) * 2;
    const src =
      value >= threshold - 0.25
        ? fullSprite
        : value >= threshold - 1.25
          ? halfSprite
          : emptySprite;
    icons.push({ key: `b-${i}`, src });
  }
  if (extraFullSprite && extraValue > 0) {
    const extraSlots = Math.min(6, Math.ceil(extraValue / 2));
    for (let i = 0; i < extraSlots; i++) {
      icons.push({ key: `e-${i}`, src: extraFullSprite });
    }
  }
  return (
    <div className="mc-hud-row" aria-hidden="true">
      {icons.map((ic) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={ic.key} src={ic.src} alt="" className="mc-hud-icon" />
      ))}
    </div>
  );
}

function ItemInspectorCard({
  item,
  sourceLabel,
  onClose,
}: {
  item: DecodedItemStack;
  sourceLabel: string;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [nestedSelected, setNestedSelected] = useState<DecodedItemStack | null>(null);
  const activeItem = nestedSelected ?? item;
  const allEnchants = [...activeItem.enchantments, ...activeItem.storedEnchantments];
  const hasDurability =
    !activeItem.unbreakable &&
    activeItem.maxDamage !== null &&
    activeItem.maxDamage > 0;
  const remainingDur = hasDurability
    ? Math.max(0, activeItem.maxDamage! - (activeItem.damage ?? 0))
    : null;

  return (
    <div className="mc-item-detail">
      <div className="mc-item-detail-head">
        <div className="mc-item-detail-title">
          <div className="mc-item-detail-icon-box">
            <MinecraftItemIcon
              id={activeItem.id}
              potionColor={activeItem.potionColor}
              dyedColor={activeItem.dyedColor}
              baseColor={activeItem.baseColor}
              glint={activeItem.glint}
              size={36}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`mc-item-name ${activeItem.glint ? "is-enchanted" : ""} ${
                  activeItem.customName ? "is-custom" : ""
                }`}
              >
                {activeItem.customName ?? activeItem.name}
              </span>
              {activeItem.count > 1 ? (
                <span className="admin-pill">×{activeItem.count}</span>
              ) : null}
              <span className="admin-pill">{nestedSelected ? `Inside ${item.customName ?? item.name}` : sourceLabel}</span>
            </div>
            {activeItem.customName ? (
              <div className="text-[11px] text-[var(--muted)]">{activeItem.name}</div>
            ) : null}
            <div className="mc-item-subid">{activeItem.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-none">
          {nestedSelected ? (
            <button
              type="button"
              className="admin-action-btn !py-1 !px-2 !text-[11px]"
              onClick={() => setNestedSelected(null)}
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back
            </button>
          ) : null}
          <button
            type="button"
            className="admin-action-btn !py-1 !px-2 !text-[11px]"
            onClick={() => {
              void navigator.clipboard.writeText(activeItem.id);
              show("Copied item ID", activeItem.id);
            }}
          >
            <i className="fa-regular fa-copy" aria-hidden="true" /> ID
          </button>
          <button
            type="button"
            className="admin-icon-button !w-7 !h-7"
            onClick={onClose}
            aria-label="Close item inspector"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Metadata pills: Potion, Trim, Durability, Unbreakable, Repair cost */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--fg-2)]">
        {activeItem.potionLabel ? (
          <span className="admin-pill is-accent">
            <i className="fa-solid fa-flask" aria-hidden="true" /> {activeItem.potionLabel}
          </span>
        ) : null}
        {activeItem.trim ? (
          <span className="admin-pill">
            Trim: {activeItem.trim.pattern} ({activeItem.trim.material})
          </span>
        ) : null}
        {activeItem.unbreakable ? (
          <span className="admin-pill is-good">Unbreakable</span>
        ) : hasDurability ? (
          <span className="admin-pill">
            Durability {remainingDur}/{activeItem.maxDamage}
          </span>
        ) : null}
        {activeItem.repairCost !== null && activeItem.repairCost > 0 ? (
          <span className="admin-pill">Anvil cost: {activeItem.repairCost}</span>
        ) : null}
        {activeItem.baseColor ? (
          <span className="admin-pill">Base: {activeItem.baseColor}</span>
        ) : null}
        {activeItem.dyedColor ? (
          <span className="admin-pill">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-white/20"
              style={{ backgroundColor: activeItem.dyedColor }}
            />
            Dyed {activeItem.dyedColor}
          </span>
        ) : null}
      </div>

      {/* Enchantments */}
      {allEnchants.length > 0 ? (
        <div className="mc-ench-list">
          {allEnchants.map((ench) => {
            const isCurse = ench.id.includes("curse");
            return (
              <span key={`${ench.id}-${ench.level}`} className={`mc-ench-chip ${isCurse ? "is-curse" : ""}`}>
                {ench.label} {ench.roman}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Banner patterns */}
      {activeItem.bannerPatterns.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-[11px] text-[var(--muted)]">
          <span className="font-semibold text-[var(--fg-2)]">Patterns:</span>
          {activeItem.bannerPatterns.map((p, idx) => (
            <span key={idx} className="admin-pill">
              {p.color} {p.pattern}
            </span>
          ))}
        </div>
      ) : null}

      {/* Lore */}
      {activeItem.lore.length > 0 ? (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[#d8b4fe] space-y-0.5 italic">
          {activeItem.lore.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : null}

      {/* Nested Shulker Box / Bundle contents */}
      {item.containerItems.length > 0 ? (
        <div className="mc-container-drawer">
          <div className="flex items-center justify-between gap-2 text-xs">
            <strong className="text-[var(--fg)]">
              <i className="fa-solid fa-box-open text-[var(--accent)] mr-1.5" aria-hidden="true" />
              Container contents ({item.containerItems.length} stack{item.containerItems.length === 1 ? "" : "s"})
            </strong>
            <span className="text-[11px] text-[var(--muted)]">Click an item inside to inspect it</span>
          </div>
          <div className="mc-slot-grid-wrap">
            <div className="mc-slot-grid">
              {item.containerItems.map((child, idx) => (
                <MinecraftSlot
                  key={`${child.slot}-${child.id}-${idx}`}
                  item={child}
                  selected={nestedSelected === child}
                  onSelect={(clicked) => setNestedSelected(clicked)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlayerInventoryView({
  playerName,
  data,
  serverOnline,
  onSaveAndRefresh,
}: {
  playerName: string;
  data: DecodedPlayerData;
  serverOnline: boolean;
  onSaveAndRefresh?: () => Promise<void>;
}) {
  const { show } = useToast();
  const [itemQuery, setItemQuery] = useState("");
  const [selected, setSelected] = useState<{ item: DecodedItemStack; label: string } | null>(null);
  const [flushing, setFlushing] = useState(false);

  const q = itemQuery.trim().toLowerCase();

  const matchCount = useMemo(() => {
    if (!q) return 0;
    const all = [
      data.equipment.head,
      data.equipment.chest,
      data.equipment.legs,
      data.equipment.feet,
      data.equipment.offhand,
      ...data.inventory,
      ...data.hotbar,
      ...data.enderChest,
    ];
    return all.filter((it) => itemMatchesQuery(it, q)).length;
  }, [data, q]);

  const slotMatch = (item: DecodedItemStack | null): "none" | "match" | "dim" => {
    if (!q) return "none";
    return itemMatchesQuery(item, q) ? "match" : "dim";
  };

  const gameModeClass =
    data.gameMode === "creative" || data.gameMode === "spectator"
      ? "is-bad"
      : data.gameMode === "adventure"
        ? "is-warn"
        : "is-good";

  const handleFlush = async () => {
    if (!onSaveAndRefresh || flushing) return;
    setFlushing(true);
    try {
      await onSaveAndRefresh();
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div className="mc-inv-shell">
      {/* Vitals & Location Strip */}
      <div className="mc-vitals-grid">
        <div className="mc-vital-card">
          <div className="mc-vital-label">
            <span>Health</span>
            <span className="mc-vital-value">
              {data.health}/{data.maxHealth}
              {data.absorption > 0 ? ` (+${data.absorption})` : ""}
            </span>
          </div>
          <HudIconBar
            value={data.health}
            max={data.maxHealth}
            fullSprite={MC_HUD_SPRITES.heartFull}
            halfSprite={MC_HUD_SPRITES.heartHalf}
            emptySprite={MC_HUD_SPRITES.heartEmpty}
            extraFullSprite={MC_HUD_SPRITES.heartAbsorbFull}
            extraValue={data.absorption}
            capIcons={20}
          />
        </div>

        <div className="mc-vital-card">
          <div className="mc-vital-label">
            <span>Hunger &amp; Armor</span>
            <span className="mc-vital-value">
              {data.foodLevel}/20 · {data.armorPoints} def
            </span>
          </div>
          <HudIconBar
            value={data.foodLevel}
            max={20}
            fullSprite={MC_HUD_SPRITES.foodFull}
            halfSprite={MC_HUD_SPRITES.foodHalf}
            emptySprite={MC_HUD_SPRITES.foodEmpty}
            capIcons={10}
          />
          {data.armorPoints > 0 ? (
            <HudIconBar
              value={data.armorPoints}
              max={20}
              fullSprite={MC_HUD_SPRITES.armorFull}
              halfSprite={MC_HUD_SPRITES.armorHalf}
              emptySprite={MC_HUD_SPRITES.armorEmpty}
              capIcons={10}
            />
          ) : null}
        </div>

        <div className="mc-vital-card">
          <div className="mc-vital-label">
            <span>Mode &amp; Experience</span>
            <span className={`admin-pill ${gameModeClass}`}>
              {data.gameMode.charAt(0).toUpperCase() + data.gameMode.slice(1)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#80ff20] tabular-nums">Level {data.xpLevel}</span>
            <span className="text-[11px] text-[var(--muted)] tabular-nums">
              {data.xpTotal.toLocaleString("en-US")} XP
            </span>
          </div>
          <div className="mc-xp-track" aria-label={`XP level progress ${Math.round(data.xpProgress * 100)}%`}>
            <div className="mc-xp-fill" style={{ width: `${Math.round(data.xpProgress * 100)}%` }} />
          </div>
        </div>

        <div className="mc-vital-card">
          <div className="mc-vital-label">
            <span>{data.position?.dimension ?? "World"}</span>
            {data.position ? (
              <button
                type="button"
                className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                onClick={() => {
                  const coords = `${data.position!.x} ${data.position!.y} ${data.position!.z}`;
                  void navigator.clipboard.writeText(coords);
                  show("Coordinates copied", coords);
                }}
              >
                Copy XYZ
              </button>
            ) : null}
          </div>
          <div className="font-mono text-xs text-[var(--fg)] tabular-nums">
            {data.position ? `${data.position.x}, ${data.position.y}, ${data.position.z}` : "Unknown"}
          </div>
          {data.respawn ? (
            <div className="text-[10px] font-mono text-[var(--muted)] truncate">
              Spawn: {data.respawn.x}, {data.respawn.y}, {data.respawn.z}
            </div>
          ) : null}
        </div>
      </div>

      {/* Active Potion Effects */}
      {data.activeEffects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {data.activeEffects.map((eff) => {
            const iconUrl = resolveMobEffectIcon(eff.id);
            return (
              <span key={`${eff.id}-${eff.amplifier}`} className="mc-effect-chip">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconUrl} alt="" />
                ) : (
                  <i className="fa-solid fa-wand-magic-sparkles text-[var(--accent)]" aria-hidden="true" />
                )}
                <strong>
                  {eff.label} {eff.roman}
                </strong>
                <span className="text-[var(--muted)] font-mono text-[11px]">
                  {formatEffectDuration(eff.durationSeconds, eff.infinite)}
                </span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Search & Flush Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="admin-search !max-w-72">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="sr-only">Filter player items</span>
          <input
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder="Find item, enchant, or shulker contents…"
          />
          {itemQuery ? (
            <button type="button" onClick={() => setItemQuery("")} aria-label="Clear item search">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {q ? (
            <span className="admin-pill is-accent">
              {matchCount} matching slot{matchCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {onSaveAndRefresh ? (
            <button
              type="button"
              className="admin-action-btn"
              disabled={flushing}
              onClick={() => void handleFlush()}
              title={
                serverOnline
                  ? "Runs /save-all on the live server and reloads this player's .dat inventory"
                  : "Reload this player's saved .dat inventory from Exaroton"
              }
            >
              <i className={`fa-solid fa-rotate ${flushing ? "fa-spin" : ""}`} aria-hidden="true" />
              {flushing ? "Refreshing…" : serverOnline ? "Save & refresh items" : "Refresh items"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Exaroton-style Inventory Card: Equipment + Main 27 + Hotbar 9 */}
      <div className="mc-inv-panel">
        <div className="mc-inv-section-head">
          <h3>
            <i className="fa-solid fa-suitcase text-[var(--accent)]" aria-hidden="true" />
            Player Inventory
          </h3>
          <span>{data.totalItemStacks} filled slot{data.totalItemStacks === 1 ? "" : "s"}</span>
        </div>

        {/* Equipment Strip */}
        <div className="mc-equip-layout">
          <div className="mc-player-mini">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={minotarUrl(playerName, 44)} alt="" width={40} height={40} />
            <div className="text-xs">
              <div className="font-bold text-[var(--fg)]">{playerName}</div>
              <div className="text-[11px] text-[var(--muted)]">Armor &amp; Offhand</div>
            </div>
          </div>
          <div className="mc-equip-divider" aria-hidden="true" />
          <div className="mc-equip-group" aria-label="Equipped armor">
            <MinecraftSlot
              item={data.equipment.head}
              placeholderIcon={MC_HUD_SPRITES.slotHelmet}
              placeholderLabel="Helmet slot"
              selected={selected?.item === data.equipment.head && data.equipment.head !== null}
              matchState={slotMatch(data.equipment.head)}
              onSelect={(it) => setSelected({ item: it, label: "Helmet" })}
            />
            <MinecraftSlot
              item={data.equipment.chest}
              placeholderIcon={MC_HUD_SPRITES.slotChestplate}
              placeholderLabel="Chestplate slot"
              selected={selected?.item === data.equipment.chest && data.equipment.chest !== null}
              matchState={slotMatch(data.equipment.chest)}
              onSelect={(it) => setSelected({ item: it, label: "Chestplate" })}
            />
            <MinecraftSlot
              item={data.equipment.legs}
              placeholderIcon={MC_HUD_SPRITES.slotLeggings}
              placeholderLabel="Leggings slot"
              selected={selected?.item === data.equipment.legs && data.equipment.legs !== null}
              matchState={slotMatch(data.equipment.legs)}
              onSelect={(it) => setSelected({ item: it, label: "Leggings" })}
            />
            <MinecraftSlot
              item={data.equipment.feet}
              placeholderIcon={MC_HUD_SPRITES.slotBoots}
              placeholderLabel="Boots slot"
              selected={selected?.item === data.equipment.feet && data.equipment.feet !== null}
              matchState={slotMatch(data.equipment.feet)}
              onSelect={(it) => setSelected({ item: it, label: "Boots" })}
            />
          </div>
          <div className="mc-equip-divider" aria-hidden="true" />
          <div className="mc-equip-group" aria-label="Offhand slot">
            <MinecraftSlot
              item={data.equipment.offhand}
              placeholderIcon={MC_HUD_SPRITES.slotShield}
              placeholderLabel="Offhand slot"
              selected={selected?.item === data.equipment.offhand && data.equipment.offhand !== null}
              matchState={slotMatch(data.equipment.offhand)}
              onSelect={(it) => setSelected({ item: it, label: "Offhand" })}
            />
          </div>
        </div>

        {/* 27 Main Inventory Slots + 9 Hotbar Slots */}
        <div className="mc-slot-grid-wrap">
          <div className="mc-slot-grid" role="grid" aria-label="Main inventory">
            {data.inventory.map((item, i) => (
              <MinecraftSlot
                key={`inv-${i}`}
                item={item}
                placeholderLabel={`Inventory slot ${i + 9}`}
                selected={selected?.item === item && item !== null}
                matchState={slotMatch(item)}
                onSelect={(it) => setSelected({ item: it, label: `Inventory #${i + 9}` })}
              />
            ))}
          </div>
          <div className="mc-hotbar-sep" aria-hidden="true" />
          <div className="mc-slot-grid" role="grid" aria-label="Hotbar">
            {data.hotbar.map((item, i) => (
              <MinecraftSlot
                key={`hot-${i}`}
                item={item}
                placeholderLabel={`Hotbar slot ${i + 1}`}
                held={data.selectedSlot === i}
                selected={selected?.item === item && item !== null}
                matchState={slotMatch(item)}
                onSelect={(it) =>
                  setSelected({
                    item: it,
                    label: data.selectedSlot === i ? `Hotbar #${i + 1} (Held)` : `Hotbar #${i + 1}`,
                  })
                }
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected Item Detail Inspector (appears right between Inventory & Ender Chest for instant access) */}
      {selected ? (
        <ItemInspectorCard
          key={`${selected.label}-${selected.item.id}-${selected.item.slot}`}
          item={selected.item}
          sourceLabel={selected.label}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {/* Ender Chest (27 slots) */}
      <div className="mc-inv-panel">
        <div className="mc-inv-section-head">
          <h3>
            <i className="fa-solid fa-box-archive text-[#c084fc]" aria-hidden="true" />
            Ender Chest
          </h3>
          <span>{data.totalEnderStacks}/27 slots used</span>
        </div>
        <div className="mc-slot-grid-wrap">
          <div className="mc-slot-grid" role="grid" aria-label="Ender chest">
            {data.enderChest.map((item, i) => (
              <MinecraftSlot
                key={`ec-${i}`}
                item={item}
                placeholderLabel={`Ender Chest slot ${i + 1}`}
                selected={selected?.item === item && item !== null}
                matchState={slotMatch(item)}
                onSelect={(it) => setSelected({ item: it, label: `Ender Chest #${i + 1}` })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
