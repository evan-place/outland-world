import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SCROLL } from "../config.js";

gsap.registerPlugin(ScrollTrigger);

export function createLenis() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = new Lenis({
    duration: reduced ? 0.8 : 1.4,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: !reduced,
    touchMultiplier: 1.2,
  });

  lenis.on("scroll", ScrollTrigger.update);

  ScrollTrigger.scrollerProxy(document.documentElement, {
    scrollTop(value) {
      if (arguments.length) {
        lenis.scrollTo(value, { immediate: true });
      }
      return lenis.scroll;
    },
    getBoundingClientRect() {
      return {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    },
  });

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  ScrollTrigger.addEventListener("refresh", () => lenis.resize());
  ScrollTrigger.refresh();

  return lenis;
}

export function initStoryScroll({ beats, onBeatChange, onTransitionProgress }) {
  const track = document.getElementById("scroll-track");
  track.innerHTML = "";

  beats.forEach(() => {
    const panel = document.createElement("div");
    panel.className = "scroll-panel";
    track.appendChild(panel);
  });

  const a11y = document.getElementById("story-a11y");
  let lastBeat = -1;

  const st = ScrollTrigger.create({
    trigger: track,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    scroller: document.documentElement,
    snap: {
      snapTo: 1 / (beats.length - 1),
      duration: { min: 0.15, max: SCROLL.snapDuration },
      delay: 0.05,
      ease: "power2.inOut",
    },
    onUpdate: (self) => {
      const total = beats.length - 1;
      const scaled = self.progress * total;
      const beatIndex = Math.min(beats.length - 1, Math.floor(scaled));
      const local = scaled - beatIndex;
      const holdEnd = SCROLL.holdRatio;
      let transitionProgress = 0;

      if (local > holdEnd && beatIndex < beats.length - 1) {
        transitionProgress = (local - holdEnd) / (1 - holdEnd);
      }

      if (beatIndex !== lastBeat) {
        lastBeat = beatIndex;
        a11y.innerHTML = beats[beatIndex].html.replace(/<[^>]+>/g, "");
        onBeatChange?.(beatIndex, transitionProgress);
      } else {
        onBeatChange?.(beatIndex, transitionProgress);
      }

      onTransitionProgress?.(beatIndex, transitionProgress, self.progress);
    },
  });

  return { scrollTrigger: st };
}
