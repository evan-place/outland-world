import { CONTACT } from "../config.js";
import { refreshSelectionFx } from "../chrome/selection-fx.js";
import { playCtaOpen, playCtaClose, playSuccessClick } from "../audio/ui-beep.js";

const CTA_CLICK_RATE = 1;

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function initContactModal() {
  const modal = document.getElementById("contact-modal");
  const dialog = modal?.querySelector(".contact-modal__dialog");
  const openBtn = document.getElementById("contact-open");
  const form = document.getElementById("contact-form");
  const panel = modal?.querySelector(".contact-modal__panel");
  const headline = modal?.querySelector(".contact-modal__headline");
  const errorEl = modal?.querySelector(".contact-modal__error");
  const submitBtn = form?.querySelector('[type="submit"]');

  if (!modal || !dialog || !openBtn || !form || !panel || !headline) return;

  const nameInput = form.querySelector("#contact-name");
  const emailInput = form.querySelector("#contact-email");
  const messageInput = form.querySelector("#contact-message");
  const emailLabel = modal.querySelector("[data-contact-email]");
  const copyBtn = modal.querySelector("[data-contact-copy]");

  const HEADLINE_DEFAULT = "Tomorrow starts with<br /><em>imagination</em>.";
  const SUBMIT_LABEL = "Send";
  const SUBMIT_SENDING = "Sending\u2026";
  const SUBMIT_DONE = "Done";

  // Restore clean markup in case selection-fx already wrapped this node.
  headline.innerHTML = HEADLINE_DEFAULT;
  refreshSelectionFx(headline);

  let lastFocused = null;
  let copyResetTimer = null;

  if (emailLabel) {
    emailLabel.textContent = CONTACT.toEmail;
  }

  const fieldValues = () => ({
    name: nameInput?.value.trim() ?? "",
    email: emailInput?.value.trim() ?? "",
    message: messageInput?.value.trim() ?? "",
  });

  const copyEmail = async () => {
    if (!copyBtn) return;
    try {
      await navigator.clipboard.writeText(CONTACT.toEmail);
      copyBtn.dataset.copied = "true";
      copyBtn.setAttribute("aria-label", "Email copied");
      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => {
        copyBtn.dataset.copied = "false";
        copyBtn.setAttribute("aria-label", "Copy email address");
      }, 1800);
    } catch {
      window.prompt("Copy email address:", CONTACT.toEmail);
    }
  };

  copyBtn?.addEventListener("click", () => {
    void copyEmail();
  });

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validateForm = () => {
    const { name, email, message } = fieldValues();

    if (!name) {
      return { ok: false, message: "Please add your name.", focus: nameInput };
    }
    if (!email) {
      return { ok: false, message: "Please add your email.", focus: emailInput };
    }
    if (!isValidEmail(email)) {
      return { ok: false, message: "Please enter a valid email address.", focus: emailInput };
    }
    if (!message) {
      return { ok: false, message: "Tell us what you're imagining.", focus: messageInput };
    }

    return { ok: true };
  };

  const canSubmit = () => validateForm().ok;

  const syncSubmitState = () => {
    if (!submitBtn) return;
    submitBtn.disabled = !canSubmit();
  };

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
    form.removeAttribute("data-success");
    headline.innerHTML = HEADLINE_DEFAULT;
    refreshSelectionFx(headline);
    setError("");
    if (submitBtn) {
      submitBtn.textContent = SUBMIT_LABEL;
      submitBtn.type = "submit";
    }
    syncSubmitState();
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
    playCtaClose(CTA_CLICK_RATE);
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

  openBtn.addEventListener("click", () => {
    playCtaOpen(CTA_CLICK_RATE);
    open();
  });

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

  form.addEventListener("input", syncSubmitState);
  form.addEventListener("change", syncSubmitState);
  syncSubmitState();

  submitBtn?.addEventListener("click", () => {
    if (form.dataset.success === "true") {
      resetForm();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");

    const validation = validateForm();
    if (!validation.ok) {
      setError(validation.message);
      validation.focus?.focus();
      syncSubmitState();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = SUBMIT_SENDING;
    }

    const { name, email, message } = fieldValues();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(CONTACT.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Something went wrong. Please try again.");
      }

      await new Promise((r) => setTimeout(r, 400));
      playSuccessClick();
      headline.textContent = "Thank you. We\u2019ll be in touch.";
      refreshSelectionFx(headline);
      form.dataset.success = "true";
      if (submitBtn) {
        submitBtn.textContent = SUBMIT_DONE;
        submitBtn.type = "button";
        submitBtn.disabled = false;
      }
    } catch (err) {
      const msg =
        err.name === "AbortError"
          ? "Request timed out. Please try again."
          : err.message || "Something went wrong. Please try again.";
      setError(msg);
      if (submitBtn) {
        submitBtn.textContent = SUBMIT_LABEL;
      }
      syncSubmitState();
    }
  });

  return { open, close };
}
