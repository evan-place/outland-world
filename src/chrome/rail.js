const US_TZ = "America/New_York";
const WALES_TZ = "Europe/London";
const MOBILE_RAIL_MS = 450;

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
  usEl.textContent = `${formatClock(now, US_TZ)} United States`;
  walesEl.textContent = `${formatClock(now, WALES_TZ)} Wales`;
}

export function initRail() {
  const rail = document.getElementById("chrome-rail");
  const panel = document.getElementById("rail-panel");
  const toggles = document.querySelectorAll("[data-rail-toggle]");
  const usClock = document.getElementById("rail-clock-us");
  const walesClock = document.getElementById("rail-clock-wales");

  if (!rail || !panel || !toggles?.length) return;

  const mqMobile = window.matchMedia("(max-width: 768px)");
  let clockTimer = null;
  let closeTimer = null;

  const finishClose = () => {
    rail.classList.remove("chrome-rail--closing");
    if (!rail.classList.contains("chrome-rail--open")) {
      panel.hidden = true;
    }
  };

  const setOpen = (open) => {
    if (closeTimer != null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    if (open) {
      panel.hidden = false;
      rail.classList.remove("chrome-rail--closing");
      rail.setAttribute("aria-expanded", "true");
      toggles.forEach((btn) => btn.setAttribute("aria-expanded", "true"));
      document.body.classList.add("rail-open");
      updateClocks(usClock, walesClock);
      if (clockTimer == null) {
        clockTimer = window.setInterval(() => updateClocks(usClock, walesClock), 1000);
      }

      if (mqMobile.matches) {
        // Expand above the rail with the panel parked below, then slide it up.
        rail.classList.add("chrome-rail--closing");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!document.body.classList.contains("rail-open")) return;
            rail.classList.remove("chrome-rail--closing");
            rail.classList.add("chrome-rail--open");
          });
        });
        return;
      }

      rail.classList.add("chrome-rail--open");
      return;
    }

    const wasExpanded =
      rail.classList.contains("chrome-rail--open") ||
      rail.classList.contains("chrome-rail--closing");
    rail.classList.remove("chrome-rail--open");
    rail.setAttribute("aria-expanded", "false");
    toggles.forEach((btn) => btn.setAttribute("aria-expanded", "false"));
    document.body.classList.remove("rail-open");

    if (clockTimer != null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }

    if (mqMobile.matches && wasExpanded) {
      // Keep open geometry while the panel slides down onto the rail.
      rail.classList.add("chrome-rail--closing");
      closeTimer = window.setTimeout(finishClose, MOBILE_RAIL_MS);
      return;
    }

    closeTimer = window.setTimeout(finishClose, mqMobile.matches ? MOBILE_RAIL_MS : 200);
  };

  const toggle = () => {
    setOpen(!rail.classList.contains("chrome-rail--open"));
  };

  toggles.forEach((btn) => {
    btn.addEventListener("click", toggle);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && rail.classList.contains("chrome-rail--open")) {
      setOpen(false);
    }
  });

  updateClocks(usClock, walesClock);
}
