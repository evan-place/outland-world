import { playUiOpen, playUiClose } from "../audio/ui-beep.js";

const US_TZ = "America/Chicago";
const WALES_TZ = "Europe/London";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function formatClock(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

function updateClocks(usEl, walesEl) {
  if (!usEl || !walesEl) return;
  const now = new Date();
  usEl.textContent = `${formatClock(now, US_TZ)} Minnesota`;
  walesEl.textContent = `${formatClock(now, WALES_TZ)} Wales`;
}

export function initAboutModal() {
  const modal = document.getElementById("about-modal");
  const dialog = modal?.querySelector(".about-modal__dialog");
  const openBtn = document.getElementById("about-open");
  const usClock = document.getElementById("about-clock-us");
  const walesClock = document.getElementById("about-clock-wales");

  if (!modal || !dialog || !openBtn) return;

  let lastFocused = null;
  let clockTimer = null;
  let open = false;

  const focusables = () =>
    [...dialog.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
    );

  const startClocks = () => {
    updateClocks(usClock, walesClock);
    if (clockTimer == null) {
      clockTimer = window.setInterval(() => updateClocks(usClock, walesClock), 1000);
    }
  };

  const stopClocks = () => {
    if (clockTimer != null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };

  const setOpen = (nextOpen) => {
    if (nextOpen === open) return;
    open = nextOpen;

    if (open) {
      lastFocused = document.activeElement;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      openBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("about-modal-open");
      startClocks();
      requestAnimationFrame(() => {
        modal.classList.add("about-modal--visible");
        focusables()[0]?.focus();
      });
      return;
    }

    playUiClose(0.88);
    modal.classList.remove("about-modal--visible");
    modal.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("about-modal-open");
    stopClocks();

    const onEnd = (event) => {
      if (event.propertyName !== "opacity") return;
      modal.removeEventListener("transitionend", onEnd);
      modal.hidden = true;
      lastFocused?.focus?.();
    };

    modal.addEventListener("transitionend", onEnd);
    window.setTimeout(() => {
      if (modal.hidden) return;
      modal.hidden = true;
      lastFocused?.focus?.();
    }, 320);
  };

  openBtn.addEventListener("click", () => {
    if (open) {
      setOpen(false);
      return;
    }
    playUiOpen(0.88);
    setOpen(true);
  });

  modal.querySelectorAll("[data-about-close]").forEach((el) => {
    el.addEventListener("click", () => setOpen(false));
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== "Tab") return;

    const items = focusables();
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  updateClocks(usClock, walesClock);

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
