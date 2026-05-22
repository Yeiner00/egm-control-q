import { useEffect } from "react";

const FORM_CONTROL_SELECTOR = "input, textarea, select";

const syncUserInvalidAria = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement) || !target.matches(FORM_CONTROL_SELECTOR)) return;

  let isUserInvalid = false;
  try {
    isUserInvalid = target.matches(":user-invalid");
  } catch {
    isUserInvalid = false;
  }

  if (isUserInvalid) {
    target.setAttribute("aria-invalid", "true");
    return;
  }

  target.removeAttribute("aria-invalid");
};

const syncFormControls = (form: HTMLFormElement) => {
  form.querySelectorAll(FORM_CONTROL_SELECTOR).forEach(syncUserInvalidAria);
};

export const useUserInvalidAria = () => {
  useEffect(() => {
    const handleFocusChange = (event: FocusEvent) => {
      syncUserInvalidAria(event.target);
    };

    const handleInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.getAttribute("aria-invalid") !== "true") return;
      syncUserInvalidAria(target);
    };

    const handleSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement) {
        syncFormControls(event.target);
      }
    };

    const handleInvalid = (event: Event) => {
      syncUserInvalidAria(event.target);

      if (event.target instanceof HTMLElement) {
        const form = event.target.closest("form");
        if (form instanceof HTMLFormElement) {
          syncFormControls(form);
        }
      }
    };

    document.addEventListener("blur", handleFocusChange, true);
    document.addEventListener("focus", handleFocusChange, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("blur", handleFocusChange, true);
      document.removeEventListener("focus", handleFocusChange, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);
};
