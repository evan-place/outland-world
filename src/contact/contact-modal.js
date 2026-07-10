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

  const nameInput = form.querySelector("#contact-name");
  const emailInput = form.querySelector("#contact-email");
  const messageInput = form.querySelector("#contact-message");

  let lastFocused = null;

  const fieldValues = () => ({
    name: nameInput?.value.trim() ?? "",
    email: emailInput?.value.trim() ?? "",
    company: form.querySelector("#contact-company")?.value.trim() ?? "",
    message: messageInput?.value.trim() ?? "",
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
    form.hidden = false;
    success.hidden = true;
    setError("");
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

  form.addEventListener("input", syncSubmitState);
  form.addEventListener("change", syncSubmitState);
  syncSubmitState();

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

    submitBtn?.setAttribute("disabled", "true");

    const { name, email, company, message } = fieldValues();
    const data = new FormData();
    data.append("name", name);
    data.append("email", email);
    if (company) data.append("company", company);
    data.append("message", message);
    data.append("_subject", CONTACT.subject);
    data.append("_template", "table");

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
      syncSubmitState();
    }
  });

  return { open, close };
}
