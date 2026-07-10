import { STORY_TRANSITION } from "../config.js";

const DEFAULTS = { ...STORY_TRANSITION };

const CONTROLS = [
  { key: "viewportPadRatio", label: "Viewport pad", min: 0, max: 1.2, step: 0.02, rebuild: true },
  { key: "travelPadRatio", label: "Travel padding", min: 0.8, max: 3, step: 0.05, rebuild: true },
  { key: "travelMargin", label: "Travel margin", min: 0, max: 0.2, step: 0.01, rebuild: true },
  { key: "lensStrength", label: "Lens strength", min: 0, max: 3, step: 0.01 },
  { key: "safeZoneViewportRatio", label: "Safe zone", min: 0.5, max: 0.95, step: 0.01 },
  { key: "warpBandPower", label: "Warp band power", min: 0.5, max: 3, step: 0.01 },
  { key: "distortRimPower", label: "Distort rim power", min: 0.5, max: 3, step: 0.01 },
  { key: "smearRimPower", label: "Smear rim power", min: 0.3, max: 2, step: 0.01 },
  { key: "motionSmear", label: "Motion smear", min: 0, max: 2, step: 0.01 },
  { key: "smearLength", label: "Smear length", min: 0.05, max: 0.5, step: 0.01 },
  { key: "lensRadiusX", label: "Lens radius X", min: 0.3, max: 0.8, step: 0.01 },
  { key: "lensRadiusY", label: "Lens radius Y", min: 0.3, max: 0.8, step: 0.01 },
  { key: "safeInnerX", label: "Safe inner X", min: 0.3, max: 1, step: 0.01 },
  { key: "safeOuterX", label: "Safe outer X", min: 0.5, max: 1, step: 0.01 },
  { key: "mixEdgeLow", label: "Mix edge low", min: 0, max: 1, step: 0.01 },
  { key: "mixEdgeHigh", label: "Mix edge high", min: 0, max: 1, step: 0.01 },
  { key: "travelEasePower", label: "Travel ease", min: 1, max: 5, step: 0.05 },
];

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function initLensTuner({ storyText }) {
  if (!import.meta.env.DEV || !storyText?.crt) return null;

  const panel = document.createElement("aside");
  panel.className = "lens-tuner";
  panel.setAttribute("aria-label", "Lens shader tuner");

  const header = document.createElement("div");
  header.className = "lens-tuner__header";

  const title = document.createElement("button");
  title.type = "button";
  title.className = "lens-tuner__title";
  title.textContent = "Lens tuner";
  title.setAttribute("aria-expanded", "true");

  const actions = document.createElement("div");
  actions.className = "lens-tuner__actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "lens-tuner__btn";
  copyBtn.textContent = "Copy";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "lens-tuner__btn";
  resetBtn.textContent = "Reset";

  actions.append(copyBtn, resetBtn);
  header.append(title, actions);

  const body = document.createElement("div");
  body.className = "lens-tuner__body";

  const previewRow = document.createElement("label");
  previewRow.className = "lens-tuner__row lens-tuner__row--preview";
  const previewCheck = document.createElement("input");
  previewCheck.type = "checkbox";
  previewCheck.checked = true;
  const previewLabel = document.createElement("span");
  previewLabel.textContent = "Preview transition (beat 0 → 1)";
  previewRow.append(previewCheck, previewLabel);

  const previewSlider = document.createElement("input");
  previewSlider.type = "range";
  previewSlider.className = "lens-tuner__range";
  previewSlider.min = "0";
  previewSlider.max = "100";
  previewSlider.step = "1";
  previewSlider.value = "45";

  const previewValue = document.createElement("span");
  previewValue.className = "lens-tuner__value";
  previewValue.textContent = "0.45";

  const previewWrap = document.createElement("div");
  previewWrap.className = "lens-tuner__row";
  previewWrap.append(previewSlider, previewValue);

  body.append(previewRow, previewWrap);

  const sliders = new Map();

  for (const control of CONTROLS) {
    const row = document.createElement("label");
    row.className = "lens-tuner__row";

    const name = document.createElement("span");
    name.className = "lens-tuner__label";
    name.textContent = control.label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "lens-tuner__range";
    slider.min = String(control.min);
    slider.max = String(control.max);
    slider.step = String(control.step);
    slider.value = String(STORY_TRANSITION[control.key]);

    const value = document.createElement("span");
    value.className = "lens-tuner__value";
    value.textContent = formatValue(STORY_TRANSITION[control.key]);

    row.append(name, slider, value);
    body.append(row);
    sliders.set(control.key, { control, slider, value });
  }

  panel.append(header, body);
  document.body.appendChild(panel);

  const style = document.createElement("style");
  style.textContent = `
    .lens-tuner {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 100;
      width: min(320px, calc(100vw - 24px));
      border: 1px solid rgba(252, 252, 245, 0.18);
      border-radius: 10px;
      background: rgba(29, 28, 26, 0.94);
      color: #fcfcf5;
      font: 11px/1.3 "Px Grotesk Mono", ui-monospace, monospace;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
    }

    .lens-tuner__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(252, 252, 245, 0.1);
    }

    .lens-tuner__title {
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .lens-tuner__actions {
      display: flex;
      gap: 6px;
    }

    .lens-tuner__btn {
      margin: 0;
      padding: 4px 8px;
      border: 1px solid rgba(252, 252, 245, 0.22);
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .lens-tuner__btn:hover {
      border-color: rgba(252, 252, 245, 0.45);
    }

    .lens-tuner__body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: min(62vh, 520px);
      overflow: auto;
      padding: 10px 12px 12px;
    }

    .lens-tuner.is-collapsed .lens-tuner__body {
      display: none;
    }

    .lens-tuner__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 8px;
      align-items: center;
    }

    .lens-tuner__row--preview {
      grid-template-columns: auto 1fr;
      margin-bottom: 2px;
    }

    .lens-tuner__row:not(.lens-tuner__row--preview) .lens-tuner__range {
      grid-column: 1 / -1;
    }

    .lens-tuner__label {
      color: rgba(252, 252, 245, 0.72);
    }

    .lens-tuner__value {
      min-width: 2.8em;
      text-align: right;
      color: rgba(252, 252, 245, 0.9);
    }

    .lens-tuner__range {
      width: 100%;
      margin: 0;
      accent-color: #fcfcf5;
    }
  `;
  document.head.appendChild(style);

  let previewEnabled = previewCheck.checked;

  const apply = ({ rebuild = false } = {}) => {
    if (rebuild) {
      storyText.resize();
    }

    if (previewEnabled) {
      storyText.previewLensTransition(Number(previewSlider.value) / 100);
      return;
    }

    storyText.clearLensPreview();
    storyText.refreshLens();
  };

  const syncSlidersFromConfig = () => {
    for (const { control, slider, value } of sliders.values()) {
      const current = STORY_TRANSITION[control.key];
      slider.value = String(current);
      value.textContent = formatValue(current);
    }
  };

  title.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  previewCheck.addEventListener("change", () => {
    previewEnabled = previewCheck.checked;
    previewSlider.disabled = !previewEnabled;
    apply();
  });

  previewSlider.addEventListener("input", () => {
    previewValue.textContent = (Number(previewSlider.value) / 100).toFixed(2);
    if (previewEnabled) apply();
  });

  for (const { control, slider, value } of sliders.values()) {
    slider.addEventListener("input", () => {
      STORY_TRANSITION[control.key] = Number(slider.value);
      value.textContent = formatValue(STORY_TRANSITION[control.key]);
      apply({ rebuild: control.rebuild });
    });
  }

  resetBtn.addEventListener("click", () => {
    Object.assign(STORY_TRANSITION, DEFAULTS);
    syncSlidersFromConfig();
    apply({ rebuild: true });
  });

  copyBtn.addEventListener("click", async () => {
    const payload = CONTROLS.reduce((acc, control) => {
      acc[control.key] = STORY_TRANSITION[control.key];
      return acc;
    }, {});

    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    } catch {
      console.log("Lens config:", text);
      copyBtn.textContent = "Logged";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    }
  });

  window.setTimeout(apply, 400);

  return panel;
}
