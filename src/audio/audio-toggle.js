const VIEW_SIZE = 43;
const WAVE_CY = 21.5;
const WAVE_AMP = 8.43;
const WAVE_X0 = 0.5;
const WAVE_X1 = 42.5;
const WAVE_STEPS = 128;
const BASE_FREQ = 1;
const HOVER_FREQ = 1.48;
const PHASE_SPEED = 0.045;

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
  let svg = button.querySelector(".chrome-audio__svg");

  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chrome-audio__svg");
    svg.setAttribute("viewBox", `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`);
    svg.setAttribute("width", String(VIEW_SIZE));
    svg.setAttribute("height", String(VIEW_SIZE));
    svg.setAttribute("aria-hidden", "true");

    const ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    ring.setAttribute("class", "chrome-audio__ring");
    ring.setAttribute("x", "0.5");
    ring.setAttribute("y", "0.5");
    ring.setAttribute("width", "42");
    ring.setAttribute("height", "42");
    ring.setAttribute("rx", "21");

    const wave = document.createElementNS("http://www.w3.org/2000/svg", "path");
    wave.setAttribute("class", "chrome-audio__wave");
    wave.setAttribute("fill", "none");

    svg.append(ring, wave);
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

  const onEnter = () => {
    targetFrequency = HOVER_FREQ;
  };

  const onLeave = () => {
    targetFrequency = BASE_FREQ;
  };

  paint();
  button.addEventListener("mouseenter", onEnter);
  button.addEventListener("mouseleave", onLeave);
  button.addEventListener("focus", onEnter);
  button.addEventListener("blur", onLeave);

  if (!reducedMotion) {
    raf = requestAnimationFrame(tick);
  }

  return {
    destroy() {
      if (raf != null) cancelAnimationFrame(raf);
      button.removeEventListener("mouseenter", onEnter);
      button.removeEventListener("mouseleave", onLeave);
      button.removeEventListener("focus", onEnter);
      button.removeEventListener("blur", onLeave);
    },
  };
}
