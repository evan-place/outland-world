import { assetUrl } from "../utils/asset-url.js";
import { mountAudioToggle } from "./audio-toggle.js";

const TRACK_SRC = "/assets/Portals_of_Endless_Possibility_2026-07-14T115019.mp3";
const DEFAULT_VOLUME = 0.7;

/** Idle graph — mostly clean. */
const IDLE = {
  filterHz: 16000,
  filterQ: 0.7,
  mix: 0,
  rate: 1,
  master: DEFAULT_VOLUME,
  shelfGain: 0,
};

/** CTA hover — grit/warble without a level jump. */
const CTA_HOVER = {
  filterHz: 2600,
  filterQ: 1.8,
  mix: 0.32,
  rate: 0.965,
  master: DEFAULT_VOLUME,
  shelfGain: 0,
};

/** Audio-toggle hover — brighter pitch, softer level. */
const AUDIO_HOVER = {
  filterHz: 15000,
  filterQ: 0.7,
  mix: 0,
  rate: 1.05,
  master: DEFAULT_VOLUME * 0.78,
  shelfGain: 3.5,
};

const RAMP_S = 0.28;
const AUDIO_HOVER_RAMP_S = 0.75;
/** Waveshaper adds harmonics/peaks — pad wet so it matches dry loudness. */
const WET_PAD = 0.42;

function dryWetGains(mix) {
  const t = Math.min(1, Math.max(0, mix)) * Math.PI * 0.5;
  return { dry: Math.cos(t), wet: Math.sin(t) };
}

function makeDistortionCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function rampParam(param, value, when, seconds = RAMP_S) {
  param.cancelScheduledValues(when);
  param.setValueAtTime(param.value, when);
  param.linearRampToValueAtTime(value, when + seconds);
}

export function initAmbientAudio() {
  const button = document.getElementById("audio-toggle");
  const cta = document.getElementById("contact-open");
  const toggleUi = mountAudioToggle(button);

  const audio = new Audio(assetUrl(TRACK_SRC));
  audio.loop = true;
  audio.preload = "none";
  audio.volume = 1;

  let muted = true;
  let ctaHovering = false;
  let audioHovering = false;
  let graph = null;
  let rateTarget = IDLE.rate;
  let rateRaf = null;

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tickPlaybackRate = () => {
    rateRaf = null;
    const current = audio.playbackRate || 1;
    const delta = rateTarget - current;
    if (Math.abs(delta) < 0.0008) {
      try {
        audio.playbackRate = rateTarget;
      } catch {
        /* ignore */
      }
      return;
    }
    // Ease toward target — slower = softer pitch glide (~0.8–1s).
    const next = current + delta * 0.055;
    try {
      audio.playbackRate = next;
    } catch {
      return;
    }
    rateRaf = requestAnimationFrame(tickPlaybackRate);
  };

  const setPlaybackRate = (rate, instant = false) => {
    rateTarget = rate;
    if (instant || reduceMotion) {
      if (rateRaf != null) {
        cancelAnimationFrame(rateRaf);
        rateRaf = null;
      }
      try {
        audio.playbackRate = rate;
      } catch {
        /* ignore */
      }
      return;
    }
    if (rateRaf == null) rateRaf = requestAnimationFrame(tickPlaybackRate);
  };

  const ensureGraph = () => {
    if (graph) return graph;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(audio);

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const idleMix = dryWetGains(IDLE.mix);
    dryGain.gain.value = idleMix.dry;
    wetGain.gain.value = idleMix.wet;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = IDLE.filterHz;
    filter.Q.value = IDLE.filterQ;

    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 3200;
    shelf.gain.value = IDLE.shelfGain;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(48);
    shaper.oversample = "2x";

    const wetPad = ctx.createGain();
    wetPad.gain.value = WET_PAD;

    const master = ctx.createGain();
    master.gain.value = DEFAULT_VOLUME;

    source.connect(dryGain);
    dryGain.connect(shelf);
    shelf.connect(master);

    source.connect(filter);
    filter.connect(shaper);
    shaper.connect(wetPad);
    wetPad.connect(wetGain);
    wetGain.connect(master);
    master.connect(ctx.destination);

    graph = { ctx, dryGain, wetGain, filter, shelf, master };
    return graph;
  };

  const currentTarget = () => {
    if (muted) return IDLE;
    if (ctaHovering && !reduceMotion) return CTA_HOVER;
    if (audioHovering && !reduceMotion) return AUDIO_HOVER;
    return IDLE;
  };

  const applyTone = () => {
    const g = graph;
    if (!g) return;

    const target = currentTarget();
    const { dry, wet } = dryWetGains(target.mix);
    const now = g.ctx.currentTime;
    const settlingPitch = Math.abs((audio.playbackRate || 1) - IDLE.rate) > 0.002;
    const seconds = reduceMotion
      ? 0.05
      : target === CTA_HOVER
        ? RAMP_S
        : target === AUDIO_HOVER || audioHovering || settlingPitch
          ? AUDIO_HOVER_RAMP_S
          : RAMP_S;

    rampParam(g.filter.frequency, target.filterHz, now, seconds);
    rampParam(g.filter.Q, target.filterQ, now, seconds);
    rampParam(g.wetGain.gain, wet, now, seconds);
    rampParam(g.dryGain.gain, dry, now, seconds);
    rampParam(g.shelf.gain, target.shelfGain, now, seconds);
    rampParam(g.master.gain, target.master, now, seconds);

    setPlaybackRate(target.rate);
  };

  const syncUI = () => {
    if (!button) return;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  };

  const startPlayback = async () => {
    if (muted) return false;
    const g = ensureGraph();
    try {
      if (g.ctx.state === "suspended") await g.ctx.resume();
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        audio.load();
      }
      audio.muted = false;
      await audio.play();
      applyTone();
      return true;
    } catch {
      return false;
    }
  };

  const applyMutedState = (nextMuted) => {
    muted = nextMuted;
    audio.muted = muted;
    toggleUi.setPlaying(!muted);
    syncUI();
    applyTone();
  };

  button?.addEventListener("click", async () => {
    if (muted) {
      applyMutedState(false);
      const ok = await startPlayback();
      if (!ok) {
        applyMutedState(true);
      }
    } else {
      applyMutedState(true);
      audio.pause();
    }
  });

  const setCtaHover = (active) => {
    ctaHovering = active;
    applyTone();
  };

  const setAudioHover = (active) => {
    audioHovering = active;
    applyTone();
  };

  if (cta && canHover) {
    cta.addEventListener("pointerenter", () => setCtaHover(true));
    cta.addEventListener("pointerleave", () => setCtaHover(false));
    cta.addEventListener("focus", () => {
      requestAnimationFrame(() => {
        if (cta.matches(":focus-visible")) setCtaHover(true);
      });
    });
    cta.addEventListener("blur", () => {
      if (!cta.matches(":hover")) setCtaHover(false);
    });
  }

  if (button && canHover) {
    button.addEventListener("pointerenter", () => setAudioHover(true));
    button.addEventListener("pointerleave", () => setAudioHover(false));
    button.addEventListener("focus", () => {
      requestAnimationFrame(() => {
        if (button.matches(":focus-visible")) setAudioHover(true);
      });
    });
    button.addEventListener("blur", () => {
      if (!button.matches(":hover")) setAudioHover(false);
    });
  }

  applyMutedState(true);

  return {
    audio,
    destroy() {
      toggleUi.destroy();
    },
  };
}
