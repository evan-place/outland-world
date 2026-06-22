import { CONTACT } from "../config.js";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function initContactModal() {
  const modal = document.getElementById("contact-modal");
  const dialog = modal?.querySelector(".contact-modal__dialog");
  const openBtn = document.getElementById("contact-open");
  const form = document.getElementById("contact-form");
  const panel = modal?.querySelector(".contact-modal__panel");
  const success = modal?.querySelector(".contact-modal__success");
  const errorEl = modal?.querySelector(".contact-modal__error");
  const submitBtn = form?.querySelector('[type="submit"]');

  if (!modal || !dialog || !openBtn || !form || !panel || !success) return;

  const subjectInput = form.querySelector('input[name="_subject"]');
  if (subjectInput) subjectInput.value = CONTACT.subject;

  let lastFocused = null;

  const focusables = () =>
    [...dialog.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
    );

  const setError = (message = "") => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  };

  const resetForm = () => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    setError("");
    submitBtn?.removeAttribute("disabled");
  };

  const open = () => {
    lastFocused = document.activeElement;
    resetForm();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("contact-modal-open");
    requestAnimationFrame(() => {
      modal.classList.add("contact-modal--visible");
      focusables()[0]?.focus();
    });
  };

  const close = () => {
    modal.classList.remove("contact-modal--visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("contact-modal-open");

    const onEnd = (event) => {
      if (event.propertyName !== "opacity") return;
      modal.removeEventListener("transitionend", onEnd);
      modal.hidden = true;
      resetForm();
      lastFocused?.focus?.();
    };

    modal.addEventListener("transitionend", onEnd);
    window.setTimeout(() => {
      if (modal.hidden) return;
      modal.hidden = true;
      resetForm();
      lastFocused?.focus?.();
    }, 320);
  };

  openBtn.addEventListener("click", open);

  modal.querySelectorAll("[data-contact-close]").forEach((el) => {
    el.addEventListener("click", close);
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    submitBtn?.setAttribute("disabled", "true");

    const data = new FormData(form);

    try {
      const response = await fetch(CONTACT.submitUrl, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Something went wrong. Please try again.");
      }

      form.hidden = true;
      success.hidden = false;
      success.focus();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      submitBtn?.removeAttribute("disabled");
    }
  });
}
