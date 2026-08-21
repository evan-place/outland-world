import { assetUrl } from "../utils/asset-url.js";

const BLEND_MODES = [
  "normal",
  "multiply",
  "plus-lighter",
];

/** Map authored aliases onto the three modes Three.js actually distinguishes here. */
function normalizeBlendMode(mode) {
  if (mode === "multiply") return "multiply";
  if (
    mode === "plus-lighter" ||
    mode === "screen" ||
    mode === "lighten" ||
    mode === "color-dodge"
  ) {
    return "plus-lighter";
  }
  // exclusion and anything else → normal (same WebGL path today)
  return "normal";
}

const SLIDERS = [
  { key: "anchorX", label: "Anchor X", min: 0, max: 1, step: 0.005, itemKey: "anchor", axis: "x" },
  { key: "anchorY", label: "Anchor Y", min: 0, max: 1, step: 0.005, itemKey: "anchor", axis: "y" },
  { key: "rotation", label: "Rotation", min: -180, max: 180, step: 0.5 },
  { key: "scale", label: "Scale", min: 0.2, max: 6, step: 0.01 },
  { key: "z", label: "Z depth", min: -3, max: 3, step: 0.1 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
];

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(3);
}

function fileNameFromSrc(src) {
  const file = String(src || "").split("/").pop() || "";
  try {
    return decodeURIComponent(file);
  } catch {
    return file;
  }
}

function assetThumbUrl(src) {
  if (!src) return "";
  try {
    return new URL(assetUrl(src), window.location.origin).href;
  } catch {
    return assetUrl(src);
  }
}

function describeAsset(entries, assetId) {
  const entry = entries.find((item) => item.id === assetId);
  const fileName = fileNameFromSrc(entry?.src);
  return {
    id: assetId,
    alt: entry?.alt || assetId,
    fileName: fileName || assetId,
    src: assetThumbUrl(entry?.src),
  };
}

function createAssetThumb(src, alt) {
  const img = document.createElement("img");
  img.className = "asset-layout-tuner__thumb";
  img.alt = alt || "";
  img.loading = "lazy";
  img.draggable = false;
  if (src) img.src = src;
  else img.hidden = true;
  return img;
}

function createAssetPicker({ entries, labelledBy, compact = false }) {
  let value = "";
  let onChange = null;
  let open = false;

  const root = document.createElement("div");
  root.className = `asset-picker${compact ? " asset-picker--compact" : ""}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "asset-picker__button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  if (labelledBy) button.setAttribute("aria-label", labelledBy);

  const thumb = createAssetThumb("", "");
  thumb.classList.add("asset-picker__thumb");

  const copy = document.createElement("span");
  copy.className = "asset-picker__copy";
  const name = document.createElement("span");
  name.className = "asset-picker__name";
  const meta = document.createElement("span");
  meta.className = "asset-picker__meta";
  copy.append(name, meta);

  const caret = document.createElement("span");
  caret.className = "asset-picker__caret";
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");

  button.append(thumb, copy, caret);

  const menu = document.createElement("div");
  menu.className = "asset-picker__menu";
  menu.hidden = true;

  const search = document.createElement("input");
  search.type = "search";
  search.className = "asset-picker__search";
  search.placeholder = "Filter by name or file";
  search.setAttribute("aria-label", "Filter assets");

  const grid = document.createElement("div");
  grid.className = "asset-picker__grid";
  grid.setAttribute("role", "listbox");

  menu.append(search, grid);
  root.append(button, menu);

  const renderButton = () => {
    const info = describeAsset(entries, value);
    if (info.src) {
      thumb.hidden = false;
      thumb.src = info.src;
      thumb.alt = info.alt;
    } else {
      thumb.hidden = true;
      thumb.removeAttribute("src");
    }
    name.textContent = info.fileName || "Choose asset";
    meta.textContent = info.id && info.id !== info.fileName ? info.id : info.alt !== info.fileName ? info.alt : "";
  };

  const renderGrid = (filter = "") => {
    const query = filter.trim().toLowerCase();
    grid.replaceChildren();
    for (const entry of entries) {
      const info = describeAsset(entries, entry.id);
      const hay = `${info.id} ${info.alt} ${info.fileName}`.toLowerCase();
      if (query && !hay.includes(query)) continue;

      const option = document.createElement("button");
      option.type = "button";
      option.className = "asset-picker__option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", entry.id === value ? "true" : "false");
      if (entry.id === value) option.classList.add("is-selected");
      option.title = `${info.fileName} (${info.id})`;

      const img = createAssetThumb(info.src, info.alt);
      const label = document.createElement("span");
      label.className = "asset-picker__option-label";
      label.textContent = info.fileName;

      option.append(img, label);
      option.addEventListener("click", () => {
        setValue(entry.id, { fromUser: true });
        setOpen(false);
      });
      grid.append(option);
    }
  };

  const setOpen = (next) => {
    open = Boolean(next);
    menu.hidden = !open;
    root.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      renderGrid(search.value);
      search.focus();
    }
  };

  const setValue = (next, { fromUser = false } = {}) => {
    value = next || "";
    renderButton();
    if (open) renderGrid(search.value);
    if (fromUser) onChange?.(value);
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  search.addEventListener("input", () => renderGrid(search.value));
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      button.focus();
    }
  });

  return {
    root,
    get value() {
      return value;
    },
    setValue(id) {
      setValue(id, { fromUser: false });
    },
    onChange(fn) {
      onChange = fn;
    },
    contains(node) {
      return root.contains(node);
    },
    close() {
      setOpen(false);
    },
  };
}

function readItemValue(item, slider) {
  if (slider.itemKey === "anchor") {
    return item.anchor?.[slider.axis] ?? 0.5;
  }
  if (slider.key === "opacity") {
    return item.opacity ?? 1;
  }
  return item[slider.key] ?? 0;
}

export function initAssetLayoutTuner({
  beatAssets,
  storyText,
  storyScroll,
  beats = [],
  assets = [],
  onClose = null,
}) {
  if (!beatAssets) return null;

  let beatIndex = 0;
  for (let i = 0; i < beats.length; i++) {
    if (beatAssets.getLayoutIdForBeat(i) === "field-experiences") {
      beatIndex = i;
      break;
    }
  }
  let itemIndex = 0;
  let dragEnabled = true;
  let dragging = null;
  let panelDrag = null;

  const STORAGE_KEY = "outland-asset-layout-tuner";
  const assetEntries = (assets.length > 0 ? assets : beatAssets.manifest?.assets ?? []).filter(
    (entry) => entry.enabled !== false
  );

  const panel = document.createElement("aside");
  panel.className = "asset-layout-tuner";
  panel.setAttribute("aria-label", "Asset layout tuner");

  const header = document.createElement("div");
  header.className = "asset-layout-tuner__header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "asset-layout-tuner__drag-handle";
  dragHandle.textContent = "⋮⋮";
  dragHandle.setAttribute("aria-hidden", "true");

  const title = document.createElement("button");
  title.type = "button";
  title.className = "asset-layout-tuner__title";
  title.textContent = "Asset layout";
  title.setAttribute("aria-expanded", "true");

  const actions = document.createElement("div");
  actions.className = "asset-layout-tuner__actions";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "asset-layout-tuner__btn";
  previewBtn.textContent = "Preview";
  previewBtn.title = "Preview beat transition animation (P)";

  const popOutBtn = document.createElement("button");
  popOutBtn.type = "button";
  popOutBtn.className = "asset-layout-tuner__btn";
  popOutBtn.textContent = "Pop out";
  popOutBtn.title = "Open controls in a separate window (sits beside mobile preview)";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "asset-layout-tuner__btn";
  copyBtn.textContent = "Copy";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "asset-layout-tuner__btn asset-layout-tuner__btn--primary";
  saveBtn.textContent = "Save";
  saveBtn.title = import.meta.env.DEV
    ? "Write this layout to beat-layouts.json (⌘/Ctrl+S)"
    : "Copy layout JSON for beat-layouts.json (⌘/Ctrl+S) — deploy can't write files";

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "asset-layout-tuner__btn";
  undoBtn.textContent = "Undo";
  undoBtn.title = "Undo last layout change (⌘/Ctrl+Z)";
  undoBtn.disabled = true;

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "asset-layout-tuner__btn";
  resetBtn.textContent = "Reset";
  resetBtn.title = "Restore layout to last Save (or session start)";

  const exitBtn = document.createElement("button");
  exitBtn.type = "button";
  exitBtn.className = "asset-layout-tuner__btn";
  exitBtn.textContent = "Exit";
  exitBtn.title = "Close asset layout tuner (or right-click the logo)";

  actions.append(previewBtn, popOutBtn, undoBtn, saveBtn, copyBtn, resetBtn, exitBtn);
  header.append(dragHandle, title, actions);

  const body = document.createElement("div");
  body.className = "asset-layout-tuner__body";

  const beatRow = document.createElement("label");
  beatRow.className = "asset-layout-tuner__field";
  const beatLabel = document.createElement("span");
  beatLabel.className = "asset-layout-tuner__label";
  beatLabel.textContent = "Beat";
  const beatSelect = document.createElement("select");
  beatSelect.className = "asset-layout-tuner__select";
  beats.forEach((beat, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}: ${beat.id}`;
    beatSelect.append(option);
  });
  beatRow.append(beatLabel, beatSelect);

  const layoutMeta = document.createElement("p");
  layoutMeta.className = "asset-layout-tuner__meta";

  const assetRow = document.createElement("div");
  assetRow.className = "asset-layout-tuner__field";
  const assetLabel = document.createElement("span");
  assetLabel.className = "asset-layout-tuner__label";
  assetLabel.textContent = "Layer";
  const layerList = document.createElement("div");
  layerList.className = "asset-layout-tuner__layers";
  layerList.setAttribute("role", "listbox");
  layerList.setAttribute("aria-label", "Layer");
  assetRow.append(assetLabel, layerList);

  const assetActions = document.createElement("div");
  assetActions.className = "asset-layout-tuner__asset-actions";

  const swapRow = document.createElement("div");
  swapRow.className = "asset-layout-tuner__field";
  const swapLabel = document.createElement("span");
  swapLabel.className = "asset-layout-tuner__label";
  swapLabel.textContent = "Asset file";
  const swapPicker = createAssetPicker({
    entries: assetEntries,
    labelledBy: "Asset file",
  });
  swapRow.append(swapLabel, swapPicker.root);

  const addPicker = createAssetPicker({
    entries: assetEntries,
    labelledBy: "Asset to add",
    compact: true,
  });
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "asset-layout-tuner__btn";
  addBtn.textContent = "Add";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "asset-layout-tuner__btn";
  removeBtn.textContent = "Remove";

  assetActions.append(addPicker.root, addBtn, removeBtn);

  const blendRow = document.createElement("label");
  blendRow.className = "asset-layout-tuner__field";
  const blendLabel = document.createElement("span");
  blendLabel.className = "asset-layout-tuner__label";
  blendLabel.textContent = "Blend";
  const blendSelect = document.createElement("select");
  blendSelect.className = "asset-layout-tuner__select";
  for (const mode of BLEND_MODES) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;
    blendSelect.append(option);
  }
  blendRow.append(blendLabel, blendSelect);

  const safeZoneRow = document.createElement("label");
  safeZoneRow.className = "asset-layout-tuner__row asset-layout-tuner__row--check";
  const safeZoneCheck = document.createElement("input");
  safeZoneCheck.type = "checkbox";
  safeZoneCheck.checked = true;
  const safeZoneText = document.createElement("span");
  safeZoneText.textContent = "Ignore safe-zone nudge";
  safeZoneRow.append(safeZoneCheck, safeZoneText);

  const viewportRow = document.createElement("label");
  viewportRow.className = "asset-layout-tuner__field";
  const viewportLabel = document.createElement("span");
  viewportLabel.className = "asset-layout-tuner__label";
  viewportLabel.textContent = "Viewport";
  const viewportSelect = document.createElement("select");
  viewportSelect.className = "asset-layout-tuner__select";
  for (const [value, label] of [
    ["auto", "Auto (window · <768px = mobile)"],
    ["desktop", "Desktop"],
    ["mobile", "Mobile · 390×844"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    viewportSelect.append(option);
  }
  viewportSelect.value = "desktop";
  viewportRow.append(viewportLabel, viewportSelect);

  const viewportHint = document.createElement("p");
  viewportHint.className = "asset-layout-tuner__meta";
  viewportHint.textContent = "Desktop layout — full window.";

  const dragRow = document.createElement("label");
  dragRow.className = "asset-layout-tuner__row asset-layout-tuner__row--check";
  const dragCheck = document.createElement("input");
  dragCheck.type = "checkbox";
  dragCheck.checked = true;
  const dragText = document.createElement("span");
  dragText.textContent = "Drag assets on canvas";
  dragRow.append(dragCheck, dragText);

  const setupSection = document.createElement("div");
  setupSection.className = "asset-layout-tuner__setup";

  const setupToggle = document.createElement("button");
  setupToggle.type = "button";
  setupToggle.className = "asset-layout-tuner__setup-toggle";
  setupToggle.setAttribute("aria-expanded", "true");

  const setupToggleLabel = document.createElement("span");
  setupToggleLabel.textContent = "Beat & layers";
  const setupToggleHint = document.createElement("span");
  setupToggleHint.className = "asset-layout-tuner__setup-hint";
  setupToggleHint.textContent = "Hide";
  setupToggle.append(setupToggleLabel, setupToggleHint);

  const setupBody = document.createElement("div");
  setupBody.className = "asset-layout-tuner__setup-body";
  setupBody.append(
    beatRow,
    viewportRow,
    viewportHint,
    layoutMeta,
    assetRow,
    swapRow,
    assetActions,
    blendRow,
    safeZoneRow,
    dragRow
  );
  setupSection.append(setupToggle, setupBody);

  body.append(setupSection);

  const sliders = new Map();
  for (const slider of SLIDERS) {
    const row = document.createElement("label");
    row.className = "asset-layout-tuner__row";

    const name = document.createElement("span");
    name.className = "asset-layout-tuner__label";
    name.textContent = slider.label;

    const input = document.createElement("input");
    input.type = "range";
    input.className = "asset-layout-tuner__range";
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);

    const value = document.createElement("span");
    value.className = "asset-layout-tuner__value";

    row.append(name, value, input);
    body.append(row);
    sliders.set(slider.key, { slider, input, value });
  }

  panel.append(header, body);
  document.body.appendChild(panel);

  const style = document.createElement("style");
  style.textContent = `
    .asset-layout-tuner {
      position: fixed;
      left: 12px;
      bottom: 12px;
      top: auto;
      right: auto;
      z-index: 10050;
      width: 360px;
      border: 1px solid rgba(252, 252, 245, 0.18);
      border-radius: 10px;
      background: rgba(29, 28, 26, 0.94);
      color: #fcfcf5;
      font: 11px/1.3 "Px Grotesk Mono", ui-monospace, monospace;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
      touch-action: manipulation;
    }

    .asset-layout-tuner.is-minimized {
      width: auto;
      min-width: 0;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }

    .asset-layout-tuner.is-minimized .asset-layout-tuner__body,
    .asset-layout-tuner.is-minimized .asset-layout-tuner__actions {
      display: none;
    }

    .asset-layout-tuner.is-minimized .asset-layout-tuner__drag-handle {
      display: block;
      font-size: 10px;
    }

    .asset-layout-tuner.is-minimized .asset-layout-tuner__header {
      border-bottom: none;
      padding: 8px 14px;
      cursor: grab;
    }

    .asset-layout-tuner.is-minimized .asset-layout-tuner__title {
      letter-spacing: 0.06em;
    }

    .asset-layout-tuner.is-dragging {
      cursor: grabbing;
      user-select: none;
    }

    .asset-layout-tuner.is-dragging .asset-layout-tuner__header {
      cursor: grabbing;
    }

    .asset-layout-tuner__header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(252, 252, 245, 0.1);
      cursor: grab;
    }

    .asset-layout-tuner__drag-handle {
      color: rgba(252, 252, 245, 0.35);
      font-size: 12px;
      line-height: 1;
      letter-spacing: -0.12em;
      cursor: grab;
    }

    .asset-layout-tuner__title {
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      text-align: left;
      justify-self: start;
    }

    .asset-layout-tuner__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      max-width: 210px;
    }

    .asset-layout-tuner__btn,
    .asset-layout-tuner__select {
      margin: 0;
      padding: 4px 8px;
      border: 1px solid rgba(252, 252, 245, 0.22);
      border-radius: 999px;
      background: rgba(29, 28, 26, 0.8);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .asset-layout-tuner__btn--primary {
      border-color: rgba(252, 252, 245, 0.55);
      background: rgba(252, 252, 245, 0.12);
    }

    .asset-layout-tuner__btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .asset-layout-tuner__select {
      width: 100%;
      border-radius: 8px;
      padding: 6px 8px;
    }

    .asset-layout-tuner__btn:hover {
      border-color: rgba(252, 252, 245, 0.45);
    }

    .asset-layout-tuner__body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: min(70vh, 560px);
      overflow: auto;
      padding: 10px 12px 12px;
    }

    .asset-layout-tuner.is-collapsed .asset-layout-tuner__body {
      display: none;
    }

    .asset-layout-tuner__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .asset-layout-tuner__asset-actions {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 6px;
      align-items: start;
    }

    .asset-layout-tuner__layers {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 168px;
      overflow: auto;
      padding: 2px;
      margin: 0 -2px;
    }

    .asset-layout-tuner__layer {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 8px;
      align-items: center;
      width: 100%;
      margin: 0;
      padding: 4px 8px 4px 4px;
      border: 1px solid rgba(252, 252, 245, 0.16);
      border-radius: 8px;
      background: rgba(29, 28, 26, 0.55);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .asset-layout-tuner__layer:hover {
      border-color: rgba(252, 252, 245, 0.4);
    }

    .asset-layout-tuner__layer.is-selected {
      border-color: rgba(252, 252, 245, 0.55);
      background: rgba(252, 252, 245, 0.12);
    }

    .asset-layout-tuner__layer-copy,
    .asset-picker__copy {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 1px;
    }

    .asset-layout-tuner__layer-file,
    .asset-picker__name,
    .asset-picker__option-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .asset-layout-tuner__layer-id,
    .asset-picker__meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(252, 252, 245, 0.5);
      font-size: 10px;
    }

    .asset-layout-tuner__thumb {
      width: 40px;
      height: 40px;
      object-fit: contain;
      background:
        linear-gradient(45deg, rgba(252, 252, 245, 0.08) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(252, 252, 245, 0.08) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(252, 252, 245, 0.08) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(252, 252, 245, 0.08) 75%);
      background-position: 0 0, 0 6px, 6px -6px, -6px 0;
      background-size: 12px 12px;
      background-color: rgba(12, 12, 11, 0.85);
      border-radius: 4px;
      flex-shrink: 0;
    }

    .asset-picker {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .asset-picker__button {
      display: grid;
      grid-template-columns: 48px 1fr auto;
      gap: 8px;
      align-items: center;
      width: 100%;
      margin: 0;
      padding: 4px 8px 4px 4px;
      border: 1px solid rgba(252, 252, 245, 0.22);
      border-radius: 8px;
      background: rgba(29, 28, 26, 0.8);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .asset-picker--compact .asset-picker__button {
      grid-template-columns: 36px 1fr auto;
      padding: 3px 8px 3px 3px;
    }

    .asset-picker--compact .asset-picker__thumb {
      width: 32px;
      height: 32px;
    }

    .asset-picker__button:hover,
    .asset-picker.is-open .asset-picker__button {
      border-color: rgba(252, 252, 245, 0.45);
    }

    .asset-picker__caret {
      color: rgba(252, 252, 245, 0.45);
    }

    .asset-picker__menu {
      border: 1px solid rgba(252, 252, 245, 0.16);
      border-radius: 8px;
      background: rgba(18, 17, 16, 0.96);
    }

    .asset-picker__search {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 6px 8px;
      border: none;
      border-bottom: 1px solid rgba(252, 252, 245, 0.12);
      border-radius: 8px 8px 0 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }

    .asset-picker__search:focus {
      outline: none;
      background: rgba(252, 252, 245, 0.06);
    }

    .asset-picker__grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      max-height: 220px;
      overflow: auto;
      padding: 8px;
    }

    .asset-picker__option {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 4px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .asset-picker__option:hover,
    .asset-picker__option.is-selected {
      border-color: rgba(252, 252, 245, 0.35);
      background: rgba(252, 252, 245, 0.08);
    }

    .asset-picker__option .asset-layout-tuner__thumb {
      width: 100%;
      height: 64px;
    }

    .asset-picker__option-label {
      font-size: 9px;
      line-height: 1.2;
      color: rgba(252, 252, 245, 0.78);
    }

    .asset-layout-tuner__meta {
      margin: 0;
      color: rgba(252, 252, 245, 0.62);
      font-size: 10px;
      line-height: 1.4;
    }

    .asset-layout-tuner__setup {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(252, 252, 245, 0.1);
    }

    .asset-layout-tuner__setup-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      margin: 0;
      padding: 2px 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      text-align: left;
    }

    .asset-layout-tuner__setup-hint {
      color: rgba(252, 252, 245, 0.45);
      font-size: 10px;
      letter-spacing: 0.02em;
      text-transform: none;
    }

    .asset-layout-tuner__setup-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .asset-layout-tuner__setup.is-collapsed .asset-layout-tuner__setup-body {
      display: none;
    }

    .asset-layout-tuner__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 8px;
      align-items: center;
    }

    .asset-layout-tuner__row--check {
      grid-template-columns: auto 1fr;
    }

    .asset-layout-tuner__row:not(.asset-layout-tuner__row--check) .asset-layout-tuner__range {
      grid-column: 1 / -1;
    }

    .asset-layout-tuner__label {
      color: rgba(252, 252, 245, 0.72);
    }

    .asset-layout-tuner__value {
      min-width: 3.2em;
      text-align: right;
      color: rgba(252, 252, 245, 0.9);
    }

    .asset-layout-tuner__range {
      width: 100%;
      margin: 0;
      accent-color: #fcfcf5;
    }
  `;
  document.head.appendChild(style);

  const getMeshes = () => beatAssets.getMeshesForBeat(beatIndex);
  const getItem = () => getMeshes()[itemIndex]?.userData.layout.item;

  if (assetEntries[0]) addPicker.setValue(assetEntries[0].id);

  const syncLayerSelection = () => {
    [...layerList.children].forEach((row, index) => {
      const selected = index === itemIndex;
      row.classList.toggle("is-selected", selected);
      row.setAttribute("aria-selected", selected ? "true" : "false");
    });
  };

  const refreshAssetOptions = () => {
    const meshes = getMeshes();
    layerList.replaceChildren();
    meshes.forEach((mesh, index) => {
      const assetId = mesh.userData.layout.item.assetId;
      const info = describeAsset(assetEntries, assetId);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "asset-layout-tuner__layer";
      row.setAttribute("role", "option");
      row.title = `${info.fileName} (${info.id})`;

      const img = createAssetThumb(info.src, info.alt);
      const copy = document.createElement("span");
      copy.className = "asset-layout-tuner__layer-copy";
      const file = document.createElement("span");
      file.className = "asset-layout-tuner__layer-file";
      file.textContent = info.fileName;
      const id = document.createElement("span");
      id.className = "asset-layout-tuner__layer-id";
      id.textContent = info.id;
      copy.append(file, id);
      row.append(img, copy);
      row.addEventListener("click", () => selectAsset(index));
      layerList.append(row);
    });
    itemIndex = Math.min(itemIndex, Math.max(0, meshes.length - 1));
    syncLayerSelection();
  };

  const selectAsset = (index) => {
    const meshes = getMeshes();
    itemIndex = Math.max(0, Math.min(index, meshes.length - 1));
    syncLayerSelection();
    syncSlidersFromItem();
    beatAssets.setTuningSelection(beatIndex, itemIndex);
  };

  const syncSlidersFromItem = () => {
    const item = getItem();
    if (!item) return;

    for (const [key, { input, value }] of sliders) {
      const config = SLIDERS.find((slider) => slider.key === key);
      const current = readItemValue(item, config);
      input.value = String(current);
      value.textContent = formatValue(current);
    }

    blendSelect.value = normalizeBlendMode(item.blendMode ?? "normal");
    swapPicker.setValue(item.assetId);
    const assetDefault = getMeshes()[itemIndex]?.userData.layout.entry;
    const inheritedBlend = assetDefault?.blendMode;
    const inheritedOpacity = assetDefault?.opacity;
    const notes = [];
    if (!item.blendMode && inheritedBlend && inheritedBlend !== "normal") {
      notes.push(`asset default blend was ${inheritedBlend} (ignored)`);
    }
    if (item.opacity == null && inheritedOpacity != null && inheritedOpacity < 1) {
      notes.push(`asset default opacity was ${inheritedOpacity} (ignored)`);
    }
    blendRow.title = notes.length ? notes.join("; ") : "";
  };

  const applyBeat = () => {
    beatAssets.freezeForTuning(beatIndex);
    beatAssets.setLayoutTuningOptions({ skipSafeZoneNudge: safeZoneCheck.checked });
    storyScroll?.jumpToBeat?.(beatIndex);
    storyText?.showSettled?.(beatIndex);
    const layoutId = beatAssets.getLayoutIdForBeat(beatIndex);
    layoutMeta.textContent = beatAssets.isMobile
      ? `Layout: ${layoutId} · mobile`
      : `Layout: ${layoutId} · desktop`;
    refreshAssetOptions();
    selectAsset(itemIndex);
  };

  const applyViewportMode = () => {
    const mode = viewportSelect.value;
    beatAssets.setLayoutViewportOverride(mode === "auto" ? null : mode);
    viewportHint.textContent =
      mode === "mobile"
        ? "Phone frame at 390×844 (1×), left-aligned with 20px margin."
        : mode === "desktop"
          ? "Desktop layout — full window."
          : "Auto: resize browser below 768px wide for mobile.";
    storyText?.resize?.();
    applyBeat();
  };

  const applyPatch = (patch, { recordUndo = true } = {}) => {
    if (recordUndo) pushUndo();
    beatAssets.applyItemPatch(beatIndex, itemIndex, patch);
    syncSlidersFromItem();
  };

  const MAX_UNDO = 40;
  const undoStack = [];

  const syncUndoButton = () => {
    undoBtn.disabled = undoStack.length === 0;
    undoBtn.title =
      undoStack.length === 0
        ? "Nothing to undo"
        : `Undo last layout change (${undoStack.length}) — ⌘/Ctrl+Z`;
  };

  const pushUndo = () => {
    undoStack.push({
      beatIndex,
      isMobile: beatAssets.isMobile,
      itemIndex,
      items: JSON.parse(JSON.stringify(beatAssets.exportLayoutItems(beatIndex))),
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    syncUndoButton();
  };

  const flashButton = (button, label, ms = 1200) => {
    const prev = button.textContent;
    button.textContent = label;
    window.setTimeout(() => {
      button.textContent = prev;
    }, ms);
  };

  const performUndo = async () => {
    const entry = undoStack.pop();
    syncUndoButton();
    if (!entry) return;

    const needViewport =
      entry.isMobile !== beatAssets.isMobile
        ? entry.isMobile
          ? "mobile"
          : "desktop"
        : null;

    if (needViewport) {
      viewportSelect.value = needViewport;
      beatAssets.setLayoutViewportOverride(needViewport);
      storyText?.resize?.();
    }

    beatIndex = entry.beatIndex;
    beatSelect.value = String(beatIndex);
    beatAssets.applyLayoutItems(beatIndex, entry.items);
    beatAssets.freezeForTuning(beatIndex);
    beatAssets.setLayoutTuningOptions({ skipSafeZoneNudge: safeZoneCheck.checked });
    storyScroll?.jumpToBeat?.(beatIndex);
    storyText?.showSettled?.(beatIndex);

    const layoutId = beatAssets.getLayoutIdForBeat(beatIndex);
    layoutMeta.textContent = beatAssets.isMobile
      ? `Layout: ${layoutId} · mobile`
      : `Layout: ${layoutId} · desktop`;

    itemIndex = Math.max(0, Math.min(entry.itemIndex, getMeshes().length - 1));
    refreshAssetOptions();
    selectAsset(itemIndex);
  };

  const performSave = async () => {
    // Finish any in-progress drag so the saved pose matches the screen.
    if (dragging) {
      beatAssets.commitItemDrag(beatIndex, itemIndex);
      dragging = null;
      canvas.style.cursor = dragEnabled ? "grab" : "pointer";
      document.body.style.userSelect = "";
    }

    const layoutId = beatAssets.getLayoutIdForBeat(beatIndex);
    const items = beatAssets.exportLayoutItems(beatIndex);
    if (!items.length) {
      flashButton(saveBtn, "Empty");
      console.error("[asset-layout-tuner] refused to save empty layout", layoutId);
      return;
    }

    const payload = beatAssets.isMobile
      ? { id: layoutId, itemsMobile: items }
      : { id: layoutId, items };
    const text = JSON.stringify(payload, null, 2);

    saveBtn.disabled = true;
    try {
      const res = await fetch(new URL("/__outland/save-beat-layout", window.location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      // Keep in-memory layout + Reset baseline aligned with what we wrote.
      beatAssets.applyLayoutItems(beatIndex, items);
      beatAssets.commitLayoutSnapshot(beatIndex);
      syncSlidersFromItem();
      flashButton(saveBtn, "Saved");
      console.info("[asset-layout-tuner] saved", layoutId, {
        count: items.length,
        mobile: beatAssets.isMobile,
        blendModes: items.map((item) => item.blendMode),
      });
    } catch (err) {
      console.error("[asset-layout-tuner] save failed", err);
      if (import.meta.env.DEV) {
        // Locally the write endpoint should work — don't disguise failure as Copied.
        flashButton(saveBtn, "Failed");
      } else {
        try {
          await navigator.clipboard.writeText(text);
          beatAssets.commitLayoutSnapshot(beatIndex);
          flashButton(saveBtn, "Copied");
          console.info(
            "[asset-layout-tuner] Deploy can't write files — layout JSON copied. Paste into src/data/beat-layouts.json.",
            payload,
          );
        } catch (copyErr) {
          console.error("[asset-layout-tuner] clipboard failed", copyErr);
          console.log("Asset layout:", text);
          flashButton(saveBtn, "Logged");
        }
      }
    } finally {
      saveBtn.disabled = false;
    }
  };

  const closeAssetPickers = () => {
    swapPicker.close();
    addPicker.close();
  };

  const onPickerPointerDown = (event) => {
    if (swapPicker.contains(event.target) || addPicker.contains(event.target)) return;
    closeAssetPickers();
  };

  const bindPickerHost = (host) => {
    host?.addEventListener("pointerdown", onPickerPointerDown, true);
  };

  const unbindPickerHost = (host) => {
    host?.removeEventListener("pointerdown", onPickerPointerDown, true);
  };

  let popOutWindow = null;

  const getPanelWindow = () => panel.ownerDocument?.defaultView || window;

  const clampPanelPosition = (left, top) => {
    const host = getPanelWindow();
    const rect = panel.getBoundingClientRect();
    // Keep a grab strip on-screen so the panel can park mostly outside
    // a narrow viewport without getting lost.
    const handleX = 44;
    const handleY = 40;
    const minLeft = handleX - rect.width;
    const maxLeft = host.innerWidth - handleX;
    const minTop = handleY - Math.min(rect.height, handleY + 8);
    const maxTop = host.innerHeight - handleY;
    return {
      left: Math.min(Math.max(minLeft, left), maxLeft),
      top: Math.min(Math.max(minTop, top), maxTop),
    };
  };

  const dockPanel = () => {
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.removeEventListener("keydown", onPreviewKeyDown);
      unbindPickerHost(popOutWindow);
    }
    if (panel.isConnected && panel.ownerDocument === document) return;
    document.body.appendChild(panel);
    if (!document.head.contains(style)) {
      document.head.appendChild(style);
    }
    panel.style.left = "12px";
    panel.style.top = "12px";
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    popOutBtn.textContent = "Pop out";
    popOutBtn.title = "Open controls in a separate window (sits beside mobile preview)";
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.close();
    }
    popOutWindow = null;
    savePanelState();
  };

  const popOutPanel = () => {
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.focus();
      return;
    }

    const features = "popup=yes,width=360,height=760,left=80,top=80";
    const next = window.open("", "outland-asset-layout-tuner", features);
    if (!next) {
      window.alert("Pop-out blocked — allow pop-ups for localhost to move the panel beside the preview.");
      return;
    }

    popOutWindow = next;
    const doc = next.document;
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>Asset layout</title><meta charset="utf-8" /></head><body></body></html>`
    );
    doc.close();
    doc.body.style.margin = "0";
    doc.body.style.background = "#1d1c1a";
    doc.body.style.minHeight = "100vh";
    doc.head.appendChild(style);
    doc.body.appendChild(panel);
    panel.style.left = "8px";
    panel.style.top = "8px";
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    popOutBtn.textContent = "Dock";
    popOutBtn.title = "Return controls to the preview window";
    next.addEventListener("keydown", onPreviewKeyDown);
    bindPickerHost(next);

    next.addEventListener("beforeunload", () => {
      // Defer so the unload can finish before we move nodes back.
      window.setTimeout(() => {
        if (popOutWindow === next) {
          popOutWindow = null;
          dockPanel();
        }
      }, 0);
    });
  };

  const pinPanelPosition = () => {
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.bottom = "auto";
    panel.style.right = "auto";
  };

  const savePanelState = () => {
    try {
      const rect = panel.getBoundingClientRect();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          left: rect.left,
          top: rect.top,
          minimized: panel.classList.contains("is-minimized"),
          collapsed: panel.classList.contains("is-collapsed"),
          setupCollapsed: setupSection.classList.contains("is-collapsed"),
        })
      );
    } catch {
      // ignore storage errors in dev
    }
  };

  const setSetupCollapsed = (collapsed) => {
    setupSection.classList.toggle("is-collapsed", collapsed);
    setupToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    setupToggleHint.textContent = collapsed ? "Show" : "Hide";
    savePanelState();
  };

  const restorePanelState = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        const next = clampPanelPosition(saved.left, saved.top);
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
        panel.style.bottom = "auto";
        panel.style.right = "auto";
      }
      if (saved.minimized) setMinimized(true);
      else if (saved.collapsed) panel.classList.add("is-collapsed");
      if (saved.setupCollapsed) setSetupCollapsed(true);
    } catch {
      // ignore bad storage
    }
  };

  const syncStoryPreview = ({ from, progress, phase }) => {
    if (phase === "settled") {
      storyText?.showSettled?.(beatIndex);
      return;
    }
    if (phase === "intro") {
      storyText?.setBeatState?.(0, progress, 1);
      return;
    }
    storyText?.setBeatState?.(from, progress, 1);
  };

  const setMinimized = (minimized) => {
    panel.classList.toggle("is-minimized", minimized);
    if (minimized) {
      panel.classList.remove("is-collapsed");
      title.textContent = "Layout";
      title.setAttribute("aria-expanded", "false");
      previewBtn.textContent = "Open";
      previewBtn.title = "Show layout controls";
      canvas.style.pointerEvents = "none";
      canvas.style.cursor = "default";
      beatAssets.setTuningLivePreview(true, { onProgress: syncStoryPreview });
    } else {
      title.textContent = "Asset layout";
      title.setAttribute("aria-expanded", panel.classList.contains("is-collapsed") ? "false" : "true");
      previewBtn.textContent = "Preview";
      previewBtn.title = "Preview beat transition animation (P)";
      canvas.style.pointerEvents = "auto";
      canvas.style.cursor = dragEnabled ? "grab" : "pointer";
      beatAssets.setTuningLivePreview(false);
      refreshAssetOptions();
      selectAsset(itemIndex);
    }
    savePanelState();
  };

  title.addEventListener("click", () => {
    if (panel.classList.contains("is-minimized")) {
      setMinimized(false);
      return;
    }
    const collapsed = panel.classList.toggle("is-collapsed");
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
    savePanelState();
  });

  previewBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setMinimized(!panel.classList.contains("is-minimized"));
  });

  setupToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setSetupCollapsed(!setupSection.classList.contains("is-collapsed"));
  });

  popOutBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (popOutWindow && !popOutWindow.closed) {
      dockPanel();
      return;
    }
    popOutPanel();
  });

  const onPanelPointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, select, input, label, .asset-picker")) return;
    if (panel.classList.contains("is-minimized") && !event.target.closest(".asset-layout-tuner__drag-handle")) {
      return;
    }

    pinPanelPosition();
    panelDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: panel.offsetLeft,
      top: panel.offsetTop,
    };
    panel.classList.add("is-dragging");
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPanelPointerMove = (event) => {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    const dx = event.clientX - panelDrag.startX;
    const dy = event.clientY - panelDrag.startY;
    const next = clampPanelPosition(panelDrag.left + dx, panelDrag.top + dy);
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    event.preventDefault();
  };

  const onPanelPointerUp = (event) => {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    panelDrag = null;
    panel.classList.remove("is-dragging");
    header.releasePointerCapture(event.pointerId);
    savePanelState();
  };

  header.addEventListener("pointerdown", onPanelPointerDown);
  header.addEventListener("pointermove", onPanelPointerMove);
  header.addEventListener("pointerup", onPanelPointerUp);
  header.addEventListener("pointercancel", onPanelPointerUp);

  const onPreviewKeyDown = (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const tag = event.target?.tagName;
    const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

    if (event.key === "Escape") {
      closeAssetPickers();
    }

    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void performSave();
      return;
    }

    if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
      if (inField) return;
      event.preventDefault();
      void performUndo();
      return;
    }

    if (event.key !== "p" && event.key !== "P") return;
    if (mod || event.altKey) return;
    if (inField) return;
    event.preventDefault();
    setMinimized(!panel.classList.contains("is-minimized"));
  };

  window.addEventListener("keydown", onPreviewKeyDown);
  bindPickerHost(window);

  beatSelect.addEventListener("change", () => {
    beatIndex = Number(beatSelect.value);
    itemIndex = 0;
    applyBeat();
  });

  viewportSelect.addEventListener("change", () => {
    applyViewportMode();
  });

  swapPicker.onChange(async (assetId) => {
    if (!assetId || assetId === getItem()?.assetId) return;
    pushUndo();
    const ok = await beatAssets.swapLayoutItemAsset(beatIndex, itemIndex, assetId);
    if (!ok) {
      undoStack.pop();
      syncUndoButton();
      swapPicker.setValue(getItem()?.assetId ?? assetId);
      return;
    }
    refreshAssetOptions();
    syncSlidersFromItem();
  });

  addBtn.addEventListener("click", async () => {
    const assetId = addPicker.value;
    if (!assetId) return;
    pushUndo();
    const ok = await beatAssets.addLayoutItem(beatIndex, assetId);
    if (!ok) {
      undoStack.pop();
      syncUndoButton();
      return;
    }
    itemIndex = getMeshes().length - 1;
    refreshAssetOptions();
    selectAsset(itemIndex);
  });

  removeBtn.addEventListener("click", () => {
    const meshes = getMeshes();
    if (meshes.length <= 1) return;
    pushUndo();
    const ok = beatAssets.removeLayoutItem(beatIndex, itemIndex);
    if (!ok) {
      undoStack.pop();
      syncUndoButton();
      return;
    }
    itemIndex = Math.min(itemIndex, getMeshes().length - 1);
    refreshAssetOptions();
    selectAsset(itemIndex);
  });

  blendSelect.addEventListener("change", () => {
    applyPatch({ blendMode: blendSelect.value });
  });

  safeZoneCheck.addEventListener("change", () => {
    beatAssets.setLayoutTuningOptions({ skipSafeZoneNudge: safeZoneCheck.checked });
  });

  undoBtn.addEventListener("click", () => {
    void performUndo();
  });

  saveBtn.addEventListener("click", () => {
    void performSave();
  });

  exitBtn.addEventListener("click", () => {
    if (typeof onClose === "function") onClose();
    else destroyTuner();
  });

  copyBtn.addEventListener("click", async () => {
    if (dragging) {
      beatAssets.commitItemDrag(beatIndex, itemIndex);
      dragging = null;
      canvas.style.cursor = dragEnabled ? "grab" : "pointer";
      document.body.style.userSelect = "";
    }

    const layoutId = beatAssets.getLayoutIdForBeat(beatIndex);
    const items = beatAssets.exportLayoutItems(beatIndex);
    const payload = beatAssets.isMobile
      ? { id: layoutId, itemsMobile: items }
      : { id: layoutId, items };
    const text = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, "Copied");
    } catch {
      console.log("Asset layout:", text);
      flashButton(copyBtn, "Logged");
    }
  });

  const canvas = beatAssets.renderer.domElement;

  dragCheck.addEventListener("change", () => {
    dragEnabled = dragCheck.checked;
    canvas.style.cursor = dragEnabled ? "grab" : "pointer";
  });

  canvas.style.pointerEvents = "auto";
  canvas.style.cursor = dragEnabled ? "grab" : "pointer";

  for (const [key, { input, value }] of sliders) {
    let sliderGesture = false;
    const beginSliderGesture = () => {
      if (sliderGesture) return;
      pushUndo();
      sliderGesture = true;
    };
    const endSliderGesture = () => {
      sliderGesture = false;
    };

    input.addEventListener("pointerdown", beginSliderGesture);
    input.addEventListener("pointerup", endSliderGesture);
    input.addEventListener("pointercancel", endSliderGesture);
    input.addEventListener("change", endSliderGesture);

    input.addEventListener("input", () => {
      beginSliderGesture();
      const config = SLIDERS.find((slider) => slider.key === key);
      const numeric = Number(input.value);
      value.textContent = formatValue(numeric);

      if (config.itemKey === "anchor") {
        applyPatch({ anchor: { [config.axis]: numeric } }, { recordUndo: false });
        return;
      }

      if (key === "opacity") {
        applyPatch({ opacity: numeric }, { recordUndo: false });
        return;
      }

      applyPatch({ [key]: numeric }, { recordUndo: false });
    });
  }

  resetBtn.addEventListener("click", () => {
    pushUndo();
    beatAssets.resetLayoutForBeat(beatIndex);
    syncSlidersFromItem();
  });

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (panel.contains(event.target)) return;

    const mesh = beatAssets.pickMeshAt(event.clientX, event.clientY, beatIndex);
    if (!mesh) return;

    const meshes = getMeshes();
    const pickedIndex = meshes.indexOf(mesh);
    if (pickedIndex < 0) return;

    itemIndex = pickedIndex;
    selectAsset(itemIndex);

    if (!dragEnabled) return;

    const world = beatAssets.clientToWorldXY(event.clientX, event.clientY, mesh.position.z);
    if (!world) return;

    dragging = {
      pointerId: event.pointerId,
      offsetX: mesh.position.x - world.x,
      offsetY: mesh.position.y - world.y,
      z: mesh.position.z,
      recordedUndo: false,
    };
    canvas.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  let dragSyncRaf = null;
  const queueSliderSync = () => {
    if (dragSyncRaf != null) return;
    dragSyncRaf = requestAnimationFrame(() => {
      dragSyncRaf = null;
      if (!dragging) return;
      syncSlidersFromItem();
    });
  };

  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;

    const world = beatAssets.clientToWorldXY(event.clientX, event.clientY, dragging.z);
    if (!world) return;

    if (!dragging.recordedUndo) {
      pushUndo();
      dragging.recordedUndo = true;
    }

    beatAssets.dragItemToWorld(
      beatIndex,
      itemIndex,
      world.x + dragging.offsetX,
      world.y + dragging.offsetY,
    );
    queueSliderSync();
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging = null;
    if (dragSyncRaf != null) {
      cancelAnimationFrame(dragSyncRaf);
      dragSyncRaf = null;
    }
    beatAssets.commitItemDrag(beatIndex, itemIndex);
    syncSlidersFromItem();
    canvas.style.cursor = dragEnabled ? "grab" : "pointer";
    document.body.style.userSelect = "";
    canvas.releasePointerCapture?.(event.pointerId);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  beatSelect.value = String(beatIndex);
  restorePanelState();
  window.setTimeout(applyViewportMode, 600);

  const destroyTuner = () => {
    if (dragging) {
      dragging = null;
      document.body.style.userSelect = "";
    }
    if (dragSyncRaf != null) {
      cancelAnimationFrame(dragSyncRaf);
      dragSyncRaf = null;
    }
    window.removeEventListener("keydown", onPreviewKeyDown);
    unbindPickerHost(window);
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.removeEventListener("keydown", onPreviewKeyDown);
      unbindPickerHost(popOutWindow);
    }
    header.removeEventListener("pointerdown", onPanelPointerDown);
    header.removeEventListener("pointermove", onPanelPointerMove);
    header.removeEventListener("pointerup", onPanelPointerUp);
    header.removeEventListener("pointercancel", onPanelPointerUp);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.style.pointerEvents = "";
    beatAssets.setLayoutViewportOverride(null);
    beatAssets.clearTuningSelection?.();
    document.documentElement.classList.remove("asset-layout-tuner-mobile");
    document.getElementById("asset-layout-tuner-mobile-badge")?.remove();
    canvas.style.cursor = "";
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.close();
    }
    popOutWindow = null;
    panel.remove();
    style.remove();
    beatAssets.endLayoutTuning();
  };

  return {
    panel,
    destroy: destroyTuner,
  };
}
