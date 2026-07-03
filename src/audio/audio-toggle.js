const VIEW_SIZE = 43;
const WAVE_CY = 21.5;
const WAVE_AMP = 7.35;
const WAVE_X0 = 3;
const WAVE_X1 = 40;
const WAVE_STEPS = 128;
const BASE_FREQ = 1;
const HOVER_FREQ = 1.48;
const PHASE_SPEED = 0.045;
const CLIP_RADIUS = 19.6;

function buildWavePath(phase, frequency) {
  const span = WAVE_X1 - WAVE_X0;
  let d = "";
  for (let i = 0; i <= WAVE_STEPS; i++) {
    const t = i / WAVE_STEPS;
    const x = WAVE_X0 + span * t;
    const y = WAVE_CY + WAVE_AMP * Math.sin(t * Math.PI * 2 * frequency + phase);
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(3)}`;
  }
  return d;
}

export function mountAudioToggle(button) {
  if (!button) return { destroy() {} };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let svg = button.querySelector(".chrome-audio__svg");

  if (!svg) {
    const clipId = `audio-wave-clip-${Math.random().toString(36).slice(2, 9)}`;

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chrome-audio__svg");
    svg.setAttribute("viewBox", `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`);
    svg.setAttribute("width", String(VIEW_SIZE));
    svg.setAttribute("height", String(VIEW_SIZE));
    svg.setAttribute("aria-hidden", "true");

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clipPath.setAttribute("id", clipId);
    const clipCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    clipCircle.setAttribute("cx", "21.5");
    clipCircle.setAttribute("cy", "21.5");
    clipCircle.setAttribute("r", String(CLIP_RADIUS));
    clipPath.appendChild(clipCircle);
    defs.appendChild(clipPath);

    const ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    ring.setAttribute("class", "chrome-audio__ring");
    ring.setAttribute("x", "0.5");
    ring.setAttribute("y", "0.5");
    ring.setAttribute("width", "42");
    ring.setAttribute("height", "42");
    ring.setAttribute("rx", "21");

    const waveWrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
    waveWrap.setAttribute("clip-path", `url(#${clipId})`);

    const wave = document.createElementNS("http://www.w3.org/2000/svg", "path");
    wave.setAttribute("class", "chrome-audio__wave");
    wave.setAttribute("fill", "none");

    waveWrap.appendChild(wave);
    svg.append(defs, ring, waveWrap);
    button.replaceChildren(svg);
  }

  const wave = svg.querySelector(".chrome-audio__wave");
  let phase = 0;
  let frequency = BASE_FREQ;
  let targetFrequency = BASE_FREQ;
  let raf = null;

  const paint = () => {
    wave?.setAttribute("d", buildWavePath(phase, frequency));
  };

  const tick = () => {
    raf = null;
    if (!reducedMotion) {
      phase = (phase + PHASE_SPEED) % (Math.PI * 2);
      frequency += (targetFrequency - frequency) * 0.14;
      paint();
      raf = requestAnimationFrame(tick);
    }
  };

  const setHover = (active) => {
    button.classList.toggle("chrome-audio--hover", active);
    targetFrequency = active ? HOVER_FREQ : BASE_FREQ;
  };

  const onPointerEnter = () => {
    if (canHover) setHover(true);
  };

  const onPointerLeave = () => {
    if (canHover) setHover(false);
  };

  const onFocus = () => {
    requestAnimationFrame(() => {
      if (button.matches(":focus-visible")) {
        setHover(true);
      }
    });
  };

  const onBlur = () => {
    if (!canHover || !button.matches(":hover")) {
      setHover(false);
    }
  };

  paint();
  button.addEventListener("pointerenter", onPointerEnter);
  button.addEventListener("pointerleave", onPointerLeave);
  button.addEventListener("focus", onFocus);
  button.addEventListener("blur", onBlur);

  if (!reducedMotion) {
    raf = requestAnimationFrame(tick);
  }

  return {
    destroy() {
      if (raf != null) cancelAnimationFrame(raf);
      button.classList.remove("chrome-audio--hover");
      button.removeEventListener("pointerenter", onPointerEnter);
      button.removeEventListener("pointerleave", onPointerLeave);
      button.removeEventListener("focus", onFocus);
      button.removeEventListener("blur", onBlur);
    },
  };
}
