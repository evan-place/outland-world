import gsap from "gsap";
import { SCROLL } from "../config.js";

function easeTransition(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function initStoryScroll({ beats, onBeatChange }) {
  const a11y = document.getElementById("story-a11y");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const beatCount = beats.length;

  let currentBeat = 0;
  let phase = "settled";
  let transitionTween = null;
  let touchStartY = null;
  let cooldownTimer = null;

  const applyState = (from, t) => {
    const eased = easeTransition(t);
    const settledBeat =
      eased < 0.02 ? from : eased > 0.98 ? Math.min(beatCount - 1, from + 1) : from;

    a11y.innerHTML = beats[settledBeat].html.replace(/<[^>]+>/g, "");
    onBeatChange?.(from, eased);
  };

  const settleAt = (beat) => {
    currentBeat = beat;
    applyState(beat, 0);
  };

  const startCooldown = () => {
    phase = "cooldown";
    clearTimeout(cooldownTimer);
    cooldownTimer = window.setTimeout(() => {
      phase = "settled";
      cooldownTimer = null;
    }, SCROLL.stepCooldown);
  };

  const extendCooldown = () => {
    if (phase !== "cooldown") return;
    startCooldown();
  };

  const completeTransition = (fromBeat, targetBeat, startT, endT) => {
    transitionTween?.kill();

    const anim = { t: startT };
    const distance = Math.abs(endT - startT);
    const duration = Math.max(
      reduced ? 0.12 : SCROLL.transitionMinDuration,
      (reduced ? 0.2 : SCROLL.transitionDuration) * distance
    );

    applyState(fromBeat, startT);

    transitionTween = gsap.to(anim, {
      t: endT,
      duration,
      ease: "power3.out",
      onUpdate: () => applyState(fromBeat, anim.t),
      onComplete: () => {
        transitionTween = null;
        settleAt(targetBeat);
        startCooldown();
      },
    });
  };

  const beginTransition = (direction) => {
    if (phase !== "settled") return;

    const target = currentBeat + direction;
    if (target < 0 || target >= beatCount) return;

    const goingForward = direction > 0;
    const fromBeat = goingForward ? currentBeat : target;
    const kick = reduced ? 0.22 : SCROLL.transitionKick;
    const startT = goingForward ? kick : 1 - kick;
    const endT = goingForward ? 1 : 0;

    phase = "transitioning";
    completeTransition(fromBeat, target, startT, endT);
  };

  const onWheel = (event) => {
    event.preventDefault();

    if (phase === "cooldown") {
      extendCooldown();
      return;
    }

    if (phase !== "settled") return;

    const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (!direction) return;

    beginTransition(direction);
  };

  const onTouchStart = (event) => {
    if (phase !== "settled") return;
    touchStartY = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (event) => {
    if (touchStartY === null || phase !== "settled") return;

    const endY = event.changedTouches[0]?.clientY;
    if (endY == null) return;

    const delta = touchStartY - endY;
    touchStartY = null;

    if (Math.abs(delta) < SCROLL.swipeThreshold) return;
    beginTransition(delta > 0 ? 1 : -1);
  };

  const onKeyDown = (event) => {
    if (phase !== "settled") return;

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

  return {
    getCurrentBeat: () => currentBeat,
    goToBeat: (index) => {
      if (phase !== "settled" || index === currentBeat) return;
      beginTransition(index > currentBeat ? 1 : -1);
    },
    destroy() {
      transitionTween?.kill();
      clearTimeout(cooldownTimer);
      document.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
