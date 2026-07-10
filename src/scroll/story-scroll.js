import gsap from "gsap";
import { SCROLL, AUTO_PLAY, STORY_TRANSITION } from "../config.js";

export function initStoryScroll({ beats, onBeatChange, getAssetSettleDelayMs, onReturnToStart }) {
  const a11y = document.getElementById("story-a11y");
  const progressEl = document.getElementById("story-progress");
  const progressFill = progressEl?.querySelector(".story-progress__fill");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const beatCount = beats.length;

  const timing = {
    introDwell: reduced ? AUTO_PLAY.reducedIntroDwellMs : AUTO_PLAY.introDwellMs,
    beatDwell: reduced ? AUTO_PLAY.reducedBeatDwellMs : AUTO_PLAY.beatDwellMs,
    beatDwellLast: reduced ? AUTO_PLAY.reducedBeatDwellLastMs : AUTO_PLAY.beatDwellLastMs,
    transition: reduced ? AUTO_PLAY.reducedTransitionMs : STORY_TRANSITION.beatDurationMs,
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
  let transitionFromBeat = 0;
  let transitionTargetBeat = 0;
  let lastTransitionT = 0;
  let transitionGoingForward = true;

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

  let progressIntroPlayed = false;

  const engageProgress = () => {
    if (!progressEl) return;
    progressEl.hidden = false;
    progressEl.setAttribute("aria-hidden", "false");

    if (!progressIntroPlayed) {
      progressIntroPlayed = true;
      if (reduced) {
        progressEl.classList.add("story-progress--visible");
      } else {
        progressEl.classList.add("story-progress--enter");
        const track = progressEl.querySelector(".story-progress__track");
        const finishIntro = () => {
          progressEl.classList.remove("story-progress--enter");
          progressEl.classList.add("story-progress--visible");
        };
        track?.addEventListener("animationend", finishIntro, { once: true });
      }
    } else {
      progressEl.classList.add("story-progress--visible");
    }

    updatePlaybackUi();
  };

  const isStoryComplete = () => {
    if (currentBeat < beatCount - 1 || phase !== "settled" || playbackStart == null) {
      return false;
    }
    const elapsed = performance.now() - playbackStart;
    if (elapsed >= timelineTotalMs) return true;
    return performance.now() - dwellStartedAt >= dwellForBeat(currentBeat);
  };

  const shouldHideProgress = () => {
    if (currentBeat >= beatCount - 1 && phase === "settled") return true;
    if (
      phase === "transitioning" &&
      transitionGoingForward &&
      transitionTargetBeat >= beatCount - 1
    ) {
      return true;
    }
    return false;
  };

  const updatePlaybackUi = () => {
    const hideProgress = shouldHideProgress();
    if (progressEl) {
      progressEl.hidden = hideProgress;
      progressEl.setAttribute("aria-hidden", hideProgress ? "true" : "false");
      if (!hideProgress && playbackStart != null) {
        progressEl.classList.add("story-progress--visible");
      } else {
        progressEl.classList.remove("story-progress--visible");
      }
    }
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
    if (playbackStart == null || isStoryComplete()) return false;
    const elapsed = performance.now() - playbackStart;
    if (elapsed < timelineTotalMs) return true;
    if (phase === "settled" && currentBeat >= beatCount - 1) return true;
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
    updatePlaybackUi();

    if (isStoryComplete()) {
      return;
    }

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

  const transitionKick = () => (reduced ? 0.22 : SCROLL.transitionKick);
  const transitionSpan = () => Math.max(1 - transitionKick(), 0.001);

  const blendTFromU = (u, goingForward) => {
    const kick = transitionKick();
    const span = transitionSpan();
    const clampedU = Math.max(0, Math.min(1, u));
    // Shared linear clock kick→1; crt-blend mirrors spatial motion when reversing.
    return kick + span * clampedU;
  };

  const uFromBlendT = (blendT, goingForward) => {
    const kick = transitionKick();
    const span = transitionSpan();
    const clampedT = Math.max(0, Math.min(1, blendT));
    return Math.max(0, Math.min(1, (clampedT - kick) / span));
  };

  const scheduleAutoAdvance = () => {
    clearAutoTimer();
    dwellStartedAt = performance.now();
    if (!AUTO_PLAY.enabled || reduced) return;
    if (currentBeat >= beatCount - 1) return;
    if (!progressRaf) tickPlayback();
  };

  const applyState = (from, t, linearP) => {
    const progress = Math.max(0, Math.min(1, t));
    const kick = transitionKick();
    let settledBeat = from;
    if (transitionDirection >= 0) {
      if (progress < 0.02) settledBeat = from;
      else if (progress > 0.98) settledBeat = Math.min(beatCount - 1, from + 1);
    } else if (progress > 0.98) {
      settledBeat = from;
    } else if (progress < kick + 0.02) {
      settledBeat = Math.min(beatCount - 1, from + 1);
    }

    a11y.innerHTML = beats[settledBeat].html.replace(/<[^>]+>/g, "");
    onBeatChange?.(from, progress, transitionDirection, linearP);
  };

  const settleAt = (beat) => {
    currentBeat = beat;
    phase = "settled";
    transitionDirection = 1;
    applyState(beat, 0);
    scheduleAutoAdvance();
    updatePlaybackUi();
    if (!progressRaf && playbackStart != null && shouldKeepPlaybackLoop()) {
      tickPlayback();
    }
  };

  const armNextStep = (direction = transitionDirection) => {
    const guardMs = direction < 0 ? SCROLL.reverseMomentumGuardMs : SCROLL.momentumGuardMs;
    nextStepAllowedAt = performance.now() + guardMs;
    wheelAccum = 0;
  };

  const canAcceptStep = (direction = 1) => {
    if (phase !== "settled") return false;
    if (performance.now() >= nextStepAllowedAt) return true;
    if (direction < 0) {
      return (
        performance.now() >=
        nextStepAllowedAt - (SCROLL.momentumGuardMs - SCROLL.reverseMomentumGuardMs)
      );
    }
    return false;
  };

  const beatTransitionSec = () => STORY_TRANSITION.beatDurationMs / 1000;

  const transitionDurationForU = (startU) => {
    const distance = Math.max(0, 1 - startU);
    const fullSec = beatTransitionSec();
    if (reduced) return Math.max(0.12, fullSec * distance * 0.2);
    return Math.max(fullSec * 0.35, fullSec * distance);
  };

  const completeTransition = (fromBeat, targetBeat, startU, goingForward) => {
    transitionTween?.kill();
    transitionFromBeat = fromBeat;
    transitionTargetBeat = targetBeat;
    transitionGoingForward = goingForward;
    phase = "transitioning";
    clearAutoTimer();
    startPlayback();
    nextStepAllowedAt = Number.POSITIVE_INFINITY;

    const anim = { u: startU };
    const duration = transitionDurationForU(startU);

    const applyFromU = (u, linearP) => {
      const blendT = blendTFromU(u, goingForward);
      lastTransitionT = blendT;
      applyState(fromBeat, blendT, linearP);
    };

    applyFromU(startU, 0);

    transitionTween = gsap.to(anim, {
      u: 1,
      duration,
      ease: "none",
      onUpdate: function onTransitionUpdate() {
        applyFromU(anim.u, this.progress());
      },
      onComplete: () => {
        transitionTween = null;
        settleAt(targetBeat);
        armNextStep(transitionDirection);
      },
    });
  };

  const returnToStart = ({ force = false } = {}) => {
    if (currentBeat <= 0 && phase === "settled") return false;

    if (!force && phase === "settled" && !canAcceptStep(-1)) {
      return false;
    }

    transitionTween?.kill();
    transitionTween = null;
    wheelAccum = 0;
    transitionDirection = -1;
    clearAutoTimer();
    syncTimelineElapsed(0);
    onReturnToStart?.();
    settleAt(0);
    updatePlaybackUi();
    armNextStep(-1);
    return true;
  };

  const interruptTransition = (direction) => {
    if (phase !== "transitioning" || direction === transitionDirection) return false;

    if (direction < 0) {
      return returnToStart({ force: true });
    }

    const fromBeat = transitionFromBeat;
    const currentT = lastTransitionT;
    const wasForward = transitionGoingForward;

    transitionDirection = direction;
    wheelAccum = 0;

    const startU = uFromBlendT(currentT, wasForward);
    const targetBeat = Math.min(beatCount - 1, fromBeat + 1);
    if (targetBeat <= fromBeat && currentT >= 1) return false;
    syncTimelineElapsed(timelineMsAtTransitionStart(fromBeat));
    completeTransition(fromBeat, targetBeat, startU, true);
    return true;
  };

  const beginTransition = (direction, { force = false } = {}) => {
    if (direction < 0) {
      if (phase === "transitioning") {
        return interruptTransition(direction);
      }
      return returnToStart({ force });
    }

    if (phase === "transitioning") {
      return interruptTransition(direction);
    }

    if (!force && !canAcceptStep(direction)) {
      return false;
    }

    const target = currentBeat + direction;
    if (target < 0 || target >= beatCount) return false;

    wheelAccum = 0;
    syncTimelineElapsed(timelineMsAtTransitionStart(currentBeat));

    transitionDirection = direction;
    completeTransition(currentBeat, target, 0, true);
    return true;
  };

  const onWheel = (event) => {
    event.preventDefault();

    const now = performance.now();
    const interrupting = phase === "transitioning";

    if (!interrupting && phase !== "settled") {
      wheelAccum = 0;
      return;
    }

    const deltaY = event.deltaY;
    const instant =
      Math.abs(deltaY) >= SCROLL.wheelInstantDelta &&
      (interrupting || canAcceptStep(deltaY > 0 ? 1 : -1));

    if (instant) {
      wheelAccum = 0;
      beginTransition(deltaY > 0 ? 1 : -1);
      return;
    }

    if (lastWheelAt && now - lastWheelAt > SCROLL.wheelAccumDecayMs) {
      wheelAccum = 0;
    }
    lastWheelAt = now;

    wheelAccum += deltaY;

    let threshold = SCROLL.wheelThreshold;
    if (interrupting) {
      threshold = SCROLL.interruptWheelThreshold;
    } else if (wheelAccum < 0) {
      threshold = SCROLL.reverseWheelThreshold;
    }

    if (Math.abs(wheelAccum) < threshold) return;

    const direction = wheelAccum > 0 ? 1 : -1;
    if (!interrupting && !canAcceptStep(direction)) return;

    wheelAccum = 0;
    beginTransition(direction);
  };

  const onTouchStart = (event) => {
    if (phase !== "settled" && phase !== "transitioning") return;
    touchStartY = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (event) => {
    if (touchStartY === null) return;

    const endY = event.changedTouches[0]?.clientY;
    if (endY == null) return;

    const delta = touchStartY - endY;
    touchStartY = null;

    if (Math.abs(delta) < SCROLL.swipeThreshold) return;
    beginTransition(delta > 0 ? 1 : -1);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
      if (!canAcceptStep(1) && phase !== "transitioning") return;
      event.preventDefault();
      beginTransition(1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      if (!canAcceptStep(-1) && phase !== "transitioning") return;
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
    jumpToBeat: (index) => {
      const beat = Math.max(0, Math.min(beatCount - 1, index));
      if (beat === currentBeat && phase === "settled") return;
      transitionTween?.kill();
      transitionTween = null;
      wheelAccum = 0;
      transitionDirection = 1;
      clearAutoTimer();
      syncTimelineElapsed(timelineMsForBeat(beat));
      settleAt(beat);
      armNextStep(1);
    },
    goToBeat: (index) => {
      if (index === currentBeat) return;
      if (index <= 0) {
        returnToStart();
        return;
      }
      if (!canAcceptStep()) return;
      beginTransition(1);
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
