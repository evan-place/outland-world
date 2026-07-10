const BLEND_MODES = [
  "normal",
  "screen",
  "lighten",
  "color-dodge",
  "plus-lighter",
  "exclusion",
  "multiply",
];

const SLIDERS = [
  { key: "anchorX", label: "Anchor X", min: 0, max: 1, step: 0.005, itemKey: "anchor", axis: "x" },
  { key: "anchorY", label: "Anchor Y", min: 0, max: 1, step: 0.005, itemKey: "anchor", axis: "y" },
  { key: "rotation", label: "Rotation", min: -180, max: 180, step: 0.5 },
  { key: "scale", label: "Scale", min: 0.2, max: 3, step: 0.01 },
  { key: "z", label: "Z depth", min: -3, max: 3, step: 0.1 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
];

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(3);
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

export function initAssetLayoutTuner({ beatAssets, storyText, storyScroll, beats = [], assets = [] }) {
  if (!import.meta.env.DEV || !beatAssets) return null;

  let beatIndex = 0;
  for (let i = 0; i < beats.length; i++) {
    if (beatAssets.getLayoutIdForBeat(i) === "field-imagine") {
      beatIndex = i;
      break;
    }
  }
  let itemIndex = 0;
  let dragEnabled = true;
  let dragging = null;
  let panelDrag = null;

  const STORAGE_KEY = "outland-asset-layout-tuner";

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

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "asset-layout-tuner__btn";
  resetBtn.textContent = "Reset";

  actions.append(previewBtn, popOutBtn, copyBtn, resetBtn);
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

  const assetRow = document.createElement("label");
  assetRow.className = "asset-layout-tuner__field";
  const assetLabel = document.createElement("span");
  assetLabel.className = "asset-layout-tuner__label";
  assetLabel.textContent = "Layer";
  const assetSelect = document.createElement("select");
  assetSelect.className = "asset-layout-tuner__select";
  assetRow.append(assetLabel, assetSelect);

  const assetActions = document.createElement("div");
  assetActions.className = "asset-layout-tuner__asset-actions";

  const swapRow = document.createElement("label");
  swapRow.className = "asset-layout-tuner__field";
  const swapLabel = document.createElement("span");
  swapLabel.className = "asset-layout-tuner__label";
  swapLabel.textContent = "Asset file";
  const swapSelect = document.createElement("select");
  swapSelect.className = "asset-layout-tuner__select";
  swapRow.append(swapLabel, swapSelect);

  const addSelect = document.createElement("select");
  addSelect.className = "asset-layout-tuner__select";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "asset-layout-tuner__btn";
  addBtn.textContent = "Add";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "asset-layout-tuner__btn";
  removeBtn.textContent = "Remove";

  assetActions.append(addSelect, addBtn, removeBtn);

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
      z-index: 100;
      width: 320px;
      border: 1px solid rgba(252, 252, 245, 0.18);
      border-radius: 10px;
      background: rgba(29, 28, 26, 0.94);
      color: #fcfcf5;
      font: 11px/1.3 "Px Grotesk Mono", ui-monospace, monospace;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
      touch-action: none;
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
      gap: 6px;
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
      align-items: center;
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

  const manifestAssetIds =
    assets.length > 0
      ? assets.filter((entry) => entry.enabled !== false).map((entry) => entry.id)
      : beatAssets.getManifestAssetIds();

  const populateManifestSelect = (select, selectedId) => {
    select.replaceChildren();
    for (const assetId of manifestAssetIds) {
      const option = document.createElement("option");
      option.value = assetId;
      option.textContent = assetId;
      select.append(option);
    }
    if (selectedId) select.value = selectedId;
  };

  const getMeshes = () => beatAssets.getMeshesForBeat(beatIndex);
  const getItem = () => getMeshes()[itemIndex]?.userData.layout.item;

  populateManifestSelect(swapSelect);
  populateManifestSelect(addSelect, manifestAssetIds[0]);

  const refreshAssetOptions = () => {
    const meshes = getMeshes();
    assetSelect.replaceChildren();
    meshes.forEach((mesh, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = mesh.userData.layout.item.assetId;
      assetSelect.append(option);
    });
    itemIndex = Math.min(itemIndex, Math.max(0, meshes.length - 1));
    assetSelect.value = String(itemIndex);
  };

  const selectAsset = (index) => {
    const meshes = getMeshes();
    itemIndex = Math.max(0, Math.min(index, meshes.length - 1));
    assetSelect.value = String(itemIndex);
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

    blendSelect.value = item.blendMode ?? "normal";
    swapSelect.value = item.assetId;
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
      : `Layout: ${layoutId}`;
    refreshAssetOptions();
    selectAsset(itemIndex);
  };

  const applyPatch = (patch) => {
    beatAssets.applyItemPatch(beatIndex, itemIndex, patch);
    syncSlidersFromItem();
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
    if (event.target.closest("button, select, input, label")) return;
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
    if (event.key !== "p" && event.key !== "P") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    event.preventDefault();
    setMinimized(!panel.classList.contains("is-minimized"));
  };

  window.addEventListener("keydown", onPreviewKeyDown);

  beatSelect.addEventListener("change", () => {
    beatIndex = Number(beatSelect.value);
    itemIndex = 0;
    applyBeat();
  });

  assetSelect.addEventListener("change", () => {
    selectAsset(Number(assetSelect.value));
  });

  swapSelect.addEventListener("change", async () => {
    const assetId = swapSelect.value;
    if (!assetId || assetId === getItem()?.assetId) return;
    const ok = await beatAssets.swapLayoutItemAsset(beatIndex, itemIndex, assetId);
    if (!ok) {
      swapSelect.value = getItem()?.assetId ?? assetId;
      return;
    }
    refreshAssetOptions();
    syncSlidersFromItem();
  });

  addBtn.addEventListener("click", async () => {
    const assetId = addSelect.value;
    if (!assetId) return;
    const ok = await beatAssets.addLayoutItem(beatIndex, assetId);
    if (!ok) return;
    itemIndex = getMeshes().length - 1;
    refreshAssetOptions();
    selectAsset(itemIndex);
  });

  removeBtn.addEventListener("click", () => {
    const meshes = getMeshes();
    if (meshes.length <= 1) return;
    const ok = beatAssets.removeLayoutItem(beatIndex, itemIndex);
    if (!ok) return;
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

  copyBtn.addEventListener("click", async () => {
    const layoutId = beatAssets.getLayoutIdForBeat(beatIndex);
    const items = beatAssets.exportLayoutItems(beatIndex);
    const payload = beatAssets.isMobile
      ? { id: layoutId, itemsMobile: items }
      : { id: layoutId, items };
    const text = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    } catch {
      console.log("Asset layout:", text);
      copyBtn.textContent = "Logged";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
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
    input.addEventListener("input", () => {
      const config = SLIDERS.find((slider) => slider.key === key);
      const numeric = Number(input.value);
      value.textContent = formatValue(numeric);

      if (config.itemKey === "anchor") {
        applyPatch({ anchor: { [config.axis]: numeric } });
        return;
      }

      if (key === "opacity") {
        applyPatch({ opacity: numeric });
        return;
      }

      applyPatch({ [key]: numeric });
    });
  }

  resetBtn.addEventListener("click", () => {
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

    dragging = {
      lastX: event.clientX,
      lastY: event.clientY,
    };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!dragging) return;

    const rect = canvas.getBoundingClientRect();
    const worldPerPxX = 18 / rect.width;
    const worldPerPxY = 11 / rect.height;
    const dx = (event.clientX - dragging.lastX) * worldPerPxX;
    const dy = (dragging.lastY - event.clientY) * worldPerPxY;

    dragging.lastX = event.clientX;
    dragging.lastY = event.clientY;
    beatAssets.moveItemByWorldDelta(beatIndex, itemIndex, dx, dy);
    syncSlidersFromItem();
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (!dragging) return;
    dragging = null;
    canvas.releasePointerCapture?.(event.pointerId);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  beatSelect.value = String(beatIndex);
  restorePanelState();
  window.setTimeout(applyBeat, 600);

  return {
    panel,
    destroy() {
      window.removeEventListener("keydown", onPreviewKeyDown);
      header.removeEventListener("pointerdown", onPanelPointerDown);
      header.removeEventListener("pointermove", onPanelPointerMove);
      header.removeEventListener("pointerup", onPanelPointerUp);
      header.removeEventListener("pointercancel", onPanelPointerUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.style.pointerEvents = "";
      canvas.style.cursor = "";
      if (popOutWindow && !popOutWindow.closed) {
        popOutWindow.close();
      }
      popOutWindow = null;
      panel.remove();
      style.remove();
      beatAssets.endLayoutTuning();
    },
  };
}
