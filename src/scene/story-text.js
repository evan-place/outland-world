import { STORY_INTRO } from "../config.js";
import { CRTBlend } from "./crt-blend.js";

const HANDOFF_START = 0.9;

export class StoryText {
  constructor(elA, elB, canvasEl, beats) {
    this.beats = beats;
    this.outEl = elA;
    this.inEl = elB;
    this.canvasEl = canvasEl;
    this.outBeat = -1;
    this.inBeat = -1;
    this.settledBeat = -1;
    this.introPlayed = false;
    this.introPlaying = false;
    this.introTimer = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.useWarp = !this.reducedMotion;
    this.crt = this.useWarp ? new CRTBlend(canvasEl, elA) : null;

    this.showSettled(0);

    if (this.crt) {
      requestAnimationFrame(() => {
        this.crt.buildTextures(beats).then(() => this.hideWarp()).catch(console.error);
      });
    }
  }

  applyBeat(el, index) {
    const beat = this.beats[index];
    if (!beat) return;
    el.innerHTML = beat.html;
    el.className = "story-text";
  }

  ensureBeat(el, key, index) {
    if (this[key] === index) return index;
    this.applyBeat(el, index);
    this[key] = index;
    return index;
  }

  setOpacity(el, value) {
    el.style.opacity = String(value);
  }

  wrapIntroWords(html) {
    let wordIndex = 0;
    return html
      .split(/(\s+)/)
      .map((part) => {
        if (/^\s+$/.test(part)) return part;
        const delay = wordIndex * STORY_INTRO.wordStaggerMs;
        wordIndex += 1;
        return `<span class="story-text__word" style="--word-delay:${delay}ms">${part}</span>`;
      })
      .join("");
  }

  introDurationMs(wordCount) {
    return STORY_INTRO.baseDelayMs + wordCount * STORY_INTRO.wordStaggerMs + STORY_INTRO.durationMs;
  }

  clearIntroTimer() {
    if (this.introTimer != null) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
  }

  finishIntroEarly() {
    if (this.introPlayed) return;
    this.clearIntroTimer();
    this.introPlayed = true;
    this.introPlaying = false;
    this.outEl.classList.remove("story-text--intro-enter", "story-text--intro-reduced");
    this.outEl.style.transition = "";
    this.ensureBeat(this.outEl, "outBeat", 0);
    this.setOpacity(this.outEl, 1);
  }

  playIntro(el) {
    if (this.introPlaying || this.introPlayed) return;
    this.introPlaying = true;
    this.clearIntroTimer();
    const beat = this.beats[0];
    if (!beat) return;

    this.outBeat = 0;
    el.className = "story-text story-text--intro-enter";
    el.style.setProperty("--intro-drift", `${STORY_INTRO.driftY}px`);
    el.style.setProperty("--intro-scale-from", String(STORY_INTRO.scaleFrom));
    el.style.setProperty("--intro-base-delay", `${STORY_INTRO.baseDelayMs}ms`);
    el.style.setProperty("--intro-duration", `${STORY_INTRO.durationMs}ms`);

    if (this.reducedMotion) {
      el.innerHTML = beat.html;
      el.classList.add("story-text--intro-reduced");
      this.setOpacity(el, 1);
      this.introPlayed = true;
      this.introPlaying = false;
      return;
    }

    const plain = beat.html.replace(/<[^>]+>/g, "");
    const words = plain.trim().split(/\s+/).filter(Boolean);
    el.innerHTML = this.wrapIntroWords(plain);
    this.setOpacity(el, 1);

    this.introTimer = window.setTimeout(() => {
      this.introTimer = null;
      this.introPlayed = true;
      this.introPlaying = false;
      el.classList.remove("story-text--intro-enter");
      el.innerHTML = beat.html;
    }, this.introDurationMs(words.length));
  }

  hideWarp() {
    if (!this.canvasEl) return;
    this.canvasEl.style.opacity = "0";
    this.canvasEl.style.visibility = "hidden";
  }

  showWarp(opacity = 1) {
    if (!this.canvasEl) return;
    this.canvasEl.style.opacity = String(opacity);
    this.canvasEl.style.visibility = "visible";
  }

  showSettled(beat) {
    if (beat === 0 && !this.introPlayed) {
      this.playIntro(this.outEl);
    } else {
      this.ensureBeat(this.outEl, "outBeat", beat);
      this.outEl.classList.remove("story-text--intro-enter", "story-text--intro-reduced");
      this.setOpacity(this.outEl, 1);
    }

    this.setOpacity(this.inEl, 0);
    this.inBeat = -1;
    this.settledBeat = beat;
    this.hideWarp();
  }

  finalizeTransition(to) {
    const prevOut = this.outEl;
    this.outEl = this.inEl;
    this.inEl = prevOut;
    this.outBeat = this.inBeat;
    this.inBeat = -1;
    this.settledBeat = to;
    this.setOpacity(this.outEl, 1);
    this.setOpacity(this.inEl, 0);
    this.hideWarp();
  }

  setBeatState(fromIndex, progress) {
    const from = Math.max(0, Math.min(this.beats.length - 1, fromIndex));
    const to = Math.min(this.beats.length - 1, from + 1);
    const t = Math.max(0, Math.min(1, progress));

    if (from === 0 && t > 0.02 && !this.introPlayed) {
      this.finishIntroEarly();
    }

    if (from >= this.beats.length - 1 || t < 0.02) {
      this.showSettled(from);
      return;
    }

    if (!this.crt) {
      this.ensureBeat(this.outEl, "outBeat", from);
      this.ensureBeat(this.inEl, "inBeat", to);
      this.setOpacity(this.outEl, 1 - t);
      this.setOpacity(this.inEl, t);

      if (t > 0.999 && this.settledBeat !== to) {
        this.finalizeTransition(to);
      }
      return;
    }

    this.ensureBeat(this.outEl, "outBeat", from);
    this.ensureBeat(this.inEl, "inBeat", to);

    if (t > 0.999 && this.settledBeat !== to) {
      this.finalizeTransition(to);
      return;
    }

    if (t >= HANDOFF_START) {
      const handoff = (t - HANDOFF_START) / (1 - HANDOFF_START);
      this.setOpacity(this.outEl, 0);
      this.setOpacity(this.inEl, handoff);
      this.showWarp(1 - handoff);
    } else {
      this.setOpacity(this.outEl, 0);
      this.setOpacity(this.inEl, 0);
      this.showWarp(1);
    }

    this.crt.blend(from, to, t);
  }

  resize() {
    if (!this.crt) return;
    this.crt.resize();
    this.crt.buildTextures(this.beats).then(() => {
      if (this.settledBeat >= 0) {
        this.showSettled(this.settledBeat);
      }
    }).catch(console.error);
  }

  destroy() {
    this.clearIntroTimer();
    this.crt?.destroy();
  }
}
