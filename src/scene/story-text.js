import { SCROLL, STORY_TRANSITION, storyTextClassName } from "../config.js";
import { CRTBlend } from "./crt-blend.js";

export class StoryText {
  constructor(elA, elB, canvasEl, beats) {
    this.beats = beats;
    this.outEl = elA;
    this.inEl = elB;
    this.canvasEl = canvasEl;
    this.stackEl = elA.closest(".story-text-stack");
    this.stageEl = elA.closest(".story-stage");
    this.maxStackHeight = 0;
    this.stageFixed = false;
    this.outBeat = -1;
    this.inBeat = -1;
    this.settledBeat = -1;
    this.warpActive = false;
    this.canvasSettled = false;
    this.introPlayed = false;
    this.introPlaying = false;
    this.introRaf = null;
    this.introStartedAt = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.useWarp = !this.reducedMotion;
    this.crt = this.useWarp ? new CRTBlend(canvasEl, elA) : null;

    if (this.crt) {
      requestAnimationFrame(() => {
        try {
          this.crt.buildTextures(beats);
          this.installFixedStage();
          this.showSettled(0);
        } catch (err) {
          console.error(err);
          this.showSettled(0);
        }
      });
    } else {
      this.showSettled(0);
    }
  }

  applyBeat(el, index) {
    const beat = this.beats[index];
    if (!beat) return;
    el.innerHTML = beat.html;
    el.className = storyTextClassName(beat.style);
    this.positionBeatEl(el, index);
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

  introDurationMs() {
    return STORY_TRANSITION.beatDurationMs;
  }

  clearIntroAnimation() {
    if (this.introRaf != null) {
      cancelAnimationFrame(this.introRaf);
      this.introRaf = null;
    }
    this.introStartedAt = null;
    this.introPlaying = false;
  }

  finishIntroEarly() {
    if (this.introPlayed) return;
    this.clearIntroAnimation();
    this.introPlayed = true;
    if (this.crt) {
      this.showSettledCanvas(0);
    } else {
      this.ensureBeat(this.outEl, "outBeat", 0);
      this.outEl.style.visibility = "visible";
      this.setOpacity(this.outEl, 1);
    }
  }

  playCanvasIntro() {
    if (this.introPlaying || this.introPlayed || !this.crt) return;
    this.introPlaying = true;
    this.introStartedAt = performance.now();
    this.hideDomText();
    this.showWarp();
    this.warpActive = true;
    this.canvasSettled = false;

    const duration = STORY_TRANSITION.beatDurationMs;

    const tick = (now) => {
      if (this.introStartedAt == null) return;
      const linear = Math.min(1, (now - this.introStartedAt) / duration);
      this.crt.blend(0, 0, linear, 1);

      if (linear < 1) {
        this.introRaf = requestAnimationFrame(tick);
        return;
      }

      this.clearIntroAnimation();
      this.introPlayed = true;
      this.showSettledCanvas(0);
    };

    this.crt.blend(0, 0, 0, 1);
    this.introRaf = requestAnimationFrame(tick);
  }

  playReducedIntro(el) {
    if (this.introPlaying || this.introPlayed) return;
    this.introPlaying = true;
    const beat = this.beats[0];
    if (!beat) return;

    this.outBeat = 0;
    el.className = `${storyTextClassName(beat.style)} story-text--intro-reduced`;
    el.innerHTML = beat.html;
    this.positionBeatEl(el, 0);
    el.style.visibility = "visible";
    this.setOpacity(el, 1);
    this.introPlayed = true;
    this.introPlaying = false;
  }

  getBlockHeight(beatIndex) {
    const blockH = this.crt?.textures?.[beatIndex]?.blockH;
    if (blockH) return blockH;

    const beat = this.beats[beatIndex];
    if (!beat) return 0;

    const measure = document.getElementById("story-text-measure");
    if (!measure) return 0;
    measure.innerHTML = beat.html;
    measure.className = storyTextClassName(beat.style);
    return measure.offsetHeight;
  }

  refreshMaxStackHeight() {
    if (this.crt?.contentHeight) {
      this.maxStackHeight = this.crt.contentHeight;
      return this.maxStackHeight;
    }

    if (this.crt?.textures?.length) {
      this.maxStackHeight = Math.max(
        ...this.crt.textures.map((texture) => texture.stageH || texture.blockH || 0),
        1
      );
      return this.maxStackHeight;
    }

    this.maxStackHeight = Math.max(...this.beats.map((_, index) => this.getBlockHeight(index)), 1);
    return this.maxStackHeight;
  }

  installFixedStage() {
    this.refreshMaxStackHeight();
    if (!this.maxStackHeight || !this.stackEl) return;

    const heightPx = `${Math.ceil(this.maxStackHeight)}px`;
    this.stackEl.style.setProperty("--story-text-stack-h", heightPx);
    this.stageEl?.style.setProperty("--story-text-stack-h", heightPx);
    this.crt?.setStageHeight(this.maxStackHeight);
    this.stageFixed = true;
  }

  positionBeatEl(el, beatIndex) {
    if (!this.maxStackHeight) return;
    const blockH = this.getBlockHeight(beatIndex);
    const top = Math.max(0, (this.maxStackHeight - blockH) / 2);
    el.style.top = `${top}px`;
  }

  hideWarp() {
    if (!this.canvasEl) return;
    this.warpActive = false;
    this.canvasSettled = false;
    this.canvasEl.style.opacity = "0";
    this.canvasEl.style.visibility = "hidden";
  }

  showWarp() {
    if (!this.canvasEl) return;
    this.canvasEl.style.opacity = "1";
    this.canvasEl.style.visibility = "visible";
  }

  hideDomText() {
    this.setOpacity(this.outEl, 0);
    this.setOpacity(this.inEl, 0);
    this.outEl.style.visibility = "hidden";
    this.inEl.style.visibility = "hidden";
  }

  revealDomText(beat) {
    this.ensureBeat(this.outEl, "outBeat", beat);
    this.outBeat = beat;
    this.inBeat = -1;
    this.settledBeat = beat;
    this.outEl.classList.remove("story-text--intro-reduced");
    this.outEl.style.visibility = "visible";
    this.setOpacity(this.outEl, 1);
    this.setOpacity(this.inEl, 0);
    this.inEl.style.visibility = "hidden";
  }

  showSettledCanvas(beat) {
    this.ensureBeat(this.outEl, "outBeat", beat);
    this.outBeat = beat;
    this.inBeat = -1;
    this.settledBeat = beat;
    this.hideDomText();
    this.showWarp();
    this.crt.showSettledBeat(beat);
    this.warpActive = false;
    this.canvasSettled = true;
  }

  showSettled(beat) {
    if (!this.stageFixed && this.crt?.textures?.length) {
      this.installFixedStage();
    }

    if (beat === 0 && !this.introPlayed) {
      if (this.crt) {
        this.playCanvasIntro();
      } else {
        this.hideWarp();
        this.playReducedIntro(this.outEl);
      }
      return;
    }

    if (this.crt) {
      this.showSettledCanvas(beat);
      return;
    }

    this.hideWarp();
    this.revealDomText(beat);
  }

  setBeatState(fromIndex, progress, direction = 1) {
    const from = Math.max(0, Math.min(this.beats.length - 1, fromIndex));
    const to = Math.min(this.beats.length - 1, from + 1);
    const t = Math.max(0, Math.min(1, progress));

    if (from === 0 && t > 0.02 && !this.introPlayed) {
      this.finishIntroEarly();
    }

    if (from >= this.beats.length - 1 || (direction >= 0 && t < 0.02 && (from !== 0 || this.introPlayed))) {
      if (this.settledBeat !== from || !this.canvasSettled) {
        this.showSettled(from);
      }
      return;
    }

    if (direction < 0 && t > 0.98) {
      if (this.settledBeat !== from || !this.canvasSettled) {
        this.showSettled(from);
      }
      return;
    }

    if (from === 0 && !this.introPlayed) {
      return;
    }

    if (!this.stageFixed && this.crt?.textures?.length) {
      this.installFixedStage();
    }

    if (!this.crt) {
      const animT = Math.max(0, Math.min(1, t));
      const mix = 1 - Math.pow(1 - animT, STORY_TRANSITION.travelEasePower);
      if (direction < 0) {
        this.ensureBeat(this.outEl, "outBeat", to);
        this.ensureBeat(this.inEl, "inBeat", from);
      } else {
        this.ensureBeat(this.outEl, "outBeat", from);
        this.ensureBeat(this.inEl, "inBeat", to);
      }
      this.inEl.style.visibility = "visible";
      this.outEl.style.visibility = "visible";
      this.setOpacity(this.outEl, 1 - mix);
      this.setOpacity(this.inEl, mix);
      return;
    }

    if (!this.warpActive) {
      this.hideDomText();
      this.showWarp();
      this.warpActive = true;
      this.canvasSettled = false;
    }

    this.crt.blend(from, to, t, direction);
  }

  resize() {
    if (!this.crt) return;
    this.crt.resize();
    try {
      this.crt.buildTextures(this.beats);
      this.installFixedStage();
      if (this.settledBeat >= 0) {
        this.showSettled(this.settledBeat);
      }
    } catch (err) {
      console.error(err);
    }
  }

  destroy() {
    this.clearIntroAnimation();
    this.crt?.destroy();
  }

  restartFromBeginning() {
    this.clearIntroAnimation();
    this.introPlayed = false;
    this.introPlaying = false;
    this.warpActive = false;
    this.canvasSettled = false;
    this.settledBeat = -1;
    this.outBeat = -1;
    this.inBeat = -1;
    this.showSettled(0);
  }
}
