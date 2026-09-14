"use client";

import { useCallback, useState, type FormEvent } from "react";

/**
 * Inline form validation in the app's own style, instead of the browser's
 * bubbles. Forms keep their required, minLength, pattern and min/max
 * attributes for semantics; the form itself is noValidate and this hook
 * turns each control's validity into a message under the field.
 *
 * A control can carry data-message="…" to override the wording.
 */
export type FieldErrors = Record<string, string>;

function messageFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | null {
  const v = el.validity;
  if (v.valid) return null;
  if (el.dataset.message) return el.dataset.message;
  const label = el.labels?.[0]?.textContent?.replace(/optional/i, "").trim() || "This field";
  if (v.valueMissing) return el instanceof HTMLInputElement && el.type === "file" ? "Choose a file first." : `${label} is required.`;
  if (v.tooShort) return `${label} needs at least ${el.getAttribute("minlength")} characters.`;
  if (v.tooLong) return `${label} can be at most ${el.getAttribute("maxlength")} characters.`;
  if (v.patternMismatch) return `${label} has characters that are not allowed.`;
  if (v.rangeUnderflow || v.rangeOverflow) return `${label} must be between ${el.getAttribute("min")} and ${el.getAttribute("max")}.`;
  if (v.stepMismatch || v.badInput) return `${label} must be a whole number.`;
  return `${label} is not valid.`;
}

export function useValidation() {
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Returns true when the form may submit. Marks invalid fields and focuses the first. */
  const validate = useCallback((form: HTMLFormElement): boolean => {
    const next: FieldErrors = {};
    let first: HTMLElement | null = null;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      if (!el.name) continue;
      const message = messageFor(el);
      // Every <FieldError> is rendered with id "<input id>-error", so the
      // message is tied to its field for screen readers, not only announced.
      const errorId = el.id ? `${el.id}-error` : null;
      const described = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((t) => t && t !== errorId);
      if (message) {
        next[el.name] = message;
        el.setAttribute("aria-invalid", "true");
        if (errorId) described.push(errorId);
        first ??= el;
      } else {
        el.removeAttribute("aria-invalid");
      }
      if (described.length) el.setAttribute("aria-describedby", described.join(" "));
      else el.removeAttribute("aria-describedby");
    }
    setErrors(next);
    first?.focus();
    return first === null;
  }, []);

  /** Spread onto the form: <form {...formProps} action={...}> */
  const formProps = {
    noValidate: true,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      if (!validate(e.currentTarget)) e.preventDefault();
    },
  };

  const clear = useCallback((name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const rest = { ...prev };
      delete rest[name];
      return rest;
    });
  }, []);

  return { errors, validate, formProps, clear };
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-forgot">
      {message}
    </p>
  );
}
