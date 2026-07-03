import gsap from "gsap";
import { SCROLL, AUTO_PLAY } from "../config.js";

export function initStoryScroll({ beats, onBeatChange, getAssetSettleDelayMs }) {
  const a11y = document.getElementById("story-a11y");
  const progressEl = document.getElementById("story-progress");
  const progressFill = progressEl?.querySelector(".story-progress__fill");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const beatCount = beats.length;

  const timing = {
    introDwell: reduced ? AUTO_PLAY.reducedIntroDwellMs : AUTO_PLAY.introDwellMs,
    beatDwell: reduced ? AUTO_PLAY.reducedBeatDwellMs : AUTO_PLAY.beatDwellMs,
    beatDwellLast: reduced ? AUTO_PLAY.reducedBeatDwellLastMs : AUTO_PLAY.beatDwellLastMs,
    transition: reduced ? AUTO_PLAY.reducedTransitionMs : AUTO_PLAY.transitionMs,
  };

  let currentBeat = 0;
  let phase = "settled";
  let transitionTween = null;
  let touchStartY = null;
  let wheelAccum = 0;
  let lastWheelAt = 0;
  let nextStepAllowedAt = 0;
  let transitionDirection = 1;
  let autoTimer = null;
  let progressRaf = null;
  let playbackStart = null;
  let timelineTotalMs = 0;
  let dwellStartedAt = performance.now();

  const computeTimelineTotal = () => {
    if (beatCount <= 1) return timing.introDwell + timing.beatDwellLast;
    let total = timing.introDwell;
    for (let i = 0; i < beatCount - 1; i++) {
      total += timing.transition + timing.beatDwell;
    }
    total += timing.beatDwellLast;
    return total;
  };

  const timelineMsForBeat = (beat) => {
    if (beat <= 0) return 0;
    let ms = timing.introDwell + timing.transition;
    for (let i = 1; i < beat; i++) {
      ms += timing.beatDwell + timing.transition;
    }
    return ms;
  };

  const timelineMsAtTransitionStart = (fromBeat) => {
    if (fromBeat <= 0) return timing.introDwell;
    return timelineMsForBeat(fromBeat) + timing.beatDwell;
  };

  const syncTimelineElapsed = (ms) => {
    playbackStart = performance.now() - Math.max(0, Math.min(timelineTotalMs, ms));
  };

  const setProgressFill = (ratio) => {
    if (!progressFill) return;
    const value = Math.max(0, Math.min(1, ratio));
    progressFill.style.width = `${value * 100}%`;
  };

  const engageProgress = () => {
    if (!progressEl) return;
    progressEl.hidden = false;
    progressEl.setAttribute("aria-hidden", "false");
    progressEl.classList.add("story-progress--visible");
  };

  const dwellForBeat = (beat) => {
    if (beat <= 0) return timing.introDwell;
    if (beat >= beatCount - 1) return timing.beatDwellLast;
    return timing.beatDwell;
  };

  const clearAutoTimer = () => {
    if (autoTimer != null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  };

  const shouldKeepPlaybackLoop = () => {
    if (playbackStart == null) return false;
    const elapsed = performance.now() - playbackStart;
    if (elapsed < timelineTotalMs) return true;
    return (
      AUTO_PLAY.enabled &&
      !reduced &&
      phase === "settled" &&
      currentBeat < beatCount - 1
    );
  };

  const tickPlayback = () => {
    progressRaf = null;
    if (playbackStart == null) return;

    const now = performance.now();
    const elapsed = now - playbackStart;
    setProgressFill(elapsed / timelineTotalMs);

    if (
      AUTO_PLAY.enabled &&
      !reduced &&
      phase === "settled" &&
      currentBeat < beatCount - 1 &&
      now - dwellStartedAt >= dwellForBeat(currentBeat)
    ) {
      dwellStartedAt = now;
      beginTransition(1, { force: true });
    }

    if (shouldKeepPlaybackLoop()) {
      progressRaf = requestAnimationFrame(tickPlayback);
    }
  };

  const startPlayback = () => {
    if (playbackStart != null) {
      if (!progressRaf) tickPlayback();
      return;
    }
    engageProgress();
    timelineTotalMs = computeTimelineTotal();
    playbackStart = performance.now();
    tickPlayback();
  };

  let transitionFromBeat = 0;
  let transitionTargetBeat = 0;
  let lastTransitionT = 0;

  const scheduleAutoAdvance = () => {
    clearAutoTimer();
    dwellStartedAt = performance.now();
    if (!AUTO_PLAY.enabled || reduced) return;
    if (currentBeat >= beatCount - 1) return;
    if (!progressRaf) tickPlayback();
  };

  const applyState = (from, t, linearP) => {
    const progress = Math.max(0, Math.min(1, t));
    const settledBeat =
      progress < 0.02 ? from : progress > 0.98 ? Math.min(beatCount - 1, from + 1) : from;

    a11y.innerHTML = beats[settledBeat].html.replace(/<[^>]+>/g, "");
    onBeatChange?.(from, progress, transitionDirection, linearP);
  };

  const settleAt = (beat) => {
    currentBeat = beat;
    phase = "settled";
    applyState(beat, 0);
    scheduleAutoAdvance();
  };

  const armNextStep = () => {
    nextStepAllowedAt = performance.now() + SCROLL.momentumGuardMs;
    wheelAccum = 0;
  };

  const canAcceptStep = () => {
    return phase === "settled" && performance.now() >= nextStepAllowedAt;
  };

  const completeTransition = (fromBeat, targetBeat, startT, endT) => {
    transitionTween?.kill();
    transitionFromBeat = fromBeat;
    transitionTargetBeat = targetBeat;
    lastTransitionT = startT;

    const anim = { t: startT };
    const distance = Math.abs(endT - startT);
    const duration = Math.max(
      reduced ? 0.12 : SCROLL.transitionMinDuration,
      (reduced ? 0.2 : SCROLL.transitionDuration) * distance
    );

    applyState(fromBeat, startT, 0);

    transitionTween = gsap.to(anim, {
      t: endT,
      duration,
      ease: "power3.out",
      onUpdate: function onTransitionUpdate() {
        lastTransitionT = anim.t;
        applyState(fromBeat, anim.t, this.progress());
      },
      onComplete: () => {
        transitionTween = null;
        settleAt(targetBeat);
        armNextStep();
      },
    });
  };

  const beginTransition = (direction, { force = false } = {}) => {
    if (phase === "transitioning") return;

    if (!force && !canAcceptStep()) {
      return;
    }

    const target = currentBeat + direction;
    if (target < 0 || target >= beatCount) return;

    phase = "transitioning";
    clearAutoTimer();
    startPlayback();

    if (direction > 0) {
      syncTimelineElapsed(timelineMsAtTransitionStart(currentBeat));
    } else {
      syncTimelineElapsed(timelineMsForBeat(target));
    }

    wheelAccum = 0;
    nextStepAllowedAt = Number.POSITIVE_INFINITY;

    const goingForward = direction > 0;
    transitionDirection = direction;
    const fromBeat = goingForward ? currentBeat : target;
    const kick = reduced ? 0.22 : SCROLL.transitionKick;
    const startT = goingForward ? kick : 1 - kick;
    const endT = goingForward ? 1 : 0;

    completeTransition(fromBeat, target, startT, endT);
  };

  const onWheel = (event) => {
    event.preventDefault();

    const now = performance.now();

    if (phase === "transitioning" || now < nextStepAllowedAt) {
      wheelAccum = 0;
      return;
    }

    if (phase !== "settled") return;

    if (lastWheelAt && now - lastWheelAt > SCROLL.wheelAccumDecayMs) {
      wheelAccum = 0;
    }
    lastWheelAt = now;

    wheelAccum += event.deltaY;
    if (Math.abs(wheelAccum) < SCROLL.wheelThreshold) return;

    const direction = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;
    beginTransition(direction);
  };

  const onTouchStart = (event) => {
    if (phase === "transitioning" || !canAcceptStep()) return;
    touchStartY = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (event) => {
    if (touchStartY === null || phase === "transitioning" || !canAcceptStep()) return;

    const endY = event.changedTouches[0]?.clientY;
    if (endY == null) return;

    const delta = touchStartY - endY;
    touchStartY = null;

    if (Math.abs(delta) < SCROLL.swipeThreshold) return;
    beginTransition(delta > 0 ? 1 : -1);
  };

  const onKeyDown = (event) => {
    if (!canAcceptStep()) return;

    if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      beginTransition(1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      beginTransition(-1);
    }
  };

  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKeyDown);

  settleAt(0);
  startPlayback();

  return {
    getCurrentBeat: () => currentBeat,
    goToBeat: (index) => {
      if (index === currentBeat || !canAcceptStep()) return;
      beginTransition(index > currentBeat ? 1 : -1);
    },
    destroy() {
      clearAutoTimer();
      transitionTween?.kill();
      if (progressRaf != null) cancelAnimationFrame(progressRaf);
      document.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
