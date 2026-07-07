const US_TZ = "America/New_York";
const WALES_TZ = "Europe/London";

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
  const toggles = rail?.querySelectorAll("[data-rail-toggle]");
  const closeBtn = rail?.querySelector("[data-rail-close]");
  const usClock = document.getElementById("rail-clock-us");
  const walesClock = document.getElementById("rail-clock-wales");

  if (!rail || !panel || !toggles?.length) return;

  const mqMobile = window.matchMedia("(max-width: 768px)");
  let clockTimer = null;

  const setOpen = (open) => {
    if (open) {
      panel.hidden = false;
    }

    rail.classList.toggle("chrome-rail--open", open);
    rail.setAttribute("aria-expanded", open ? "true" : "false");
    toggles.forEach((btn) => {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.body.classList.toggle("rail-open", open);

    const ctaToggle = document.querySelector(".rail-toggle--cta");
    if (ctaToggle) {
      ctaToggle.hidden = !(open && mqMobile.matches);
    }

    if (!open) {
      window.setTimeout(() => {
        if (!rail.classList.contains("chrome-rail--open")) {
          panel.hidden = true;
        }
      }, 200);
    }

    if (open) {
      updateClocks(usClock, walesClock);
      clockTimer = window.setInterval(() => updateClocks(usClock, walesClock), 1000);
    } else if (clockTimer != null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };

  const toggle = () => setOpen(!rail.classList.contains("chrome-rail--open"));

  toggles.forEach((btn) => {
    btn.addEventListener("click", toggle);
  });

  closeBtn?.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && rail.classList.contains("chrome-rail--open")) {
      setOpen(false);
    }
  });

  mqMobile.addEventListener("change", () => {
    if (!mqMobile.matches) {
      document.body.classList.remove("rail-mobile-open");
    }
  });

  updateClocks(usClock, walesClock);
}
