// Server-side validation for the public quote-request submission. Treat
// every field as untrusted input from the browser — this is the actual
// gate, not the form's HTML `required`/`maxLength` attributes, which are
// a UX nicety only.

import {
  MAX_NOTES_LENGTH,
  composeDescription,
  validateServiceDetails,
  type DetailAnswer,
  type DetailField,
} from "../quote-details";

export const JOB_SERVICES = [
  "MATTRESS",
  "SOFA_COUCH",
  "CARPET_RUG",
  "CAR_INTERIOR",
  "OTHER",
] as const;

export type JobService = (typeof JOB_SERVICES)[number];

export type QuoteRequestData = {
  customerName: string;
  phone: string;
  service: JobService;
  area: string;
  description: string;
};

export type QuoteRequestFieldErrors = Partial<
  Record<"name" | "phone" | "service" | "area" | "description" | DetailField, string>
>;

// `data.description` is what gets persisted: the customer's free text for
// an unstructured request, or the composed structured summary (see
// src/lib/quote-details.ts). `details`/`notes` are null for an
// unstructured request and exist only for presentation (Cecil's email).
export type QuoteRequestValidationResult =
  | {
      ok: true;
      data: QuoteRequestData;
      details: DetailAnswer[] | null;
      notes: string | null;
    }
  | { ok: false; errors: QuoteRequestFieldErrors };

// Generous but not unbounded — these are `text` columns in Postgres, but
// an app-level cap gives some abuse resistance ahead of Pass 3's
// honeypot/Turnstile (see docs/neon-foundation.md).
const MAX_LENGTH = {
  name: 200,
  phone: 30,
  area: 200,
  description: 2000,
} as const;

// Realistic South African mobile/landline formatting without trying to
// be a full phone-number library: digits plus common separators
// (spaces, hyphens, parentheses, an optional leading "+"), then a loose
// digit-count check (9–12 covers "0821234567", "+27821234567", and
// landline-style numbers) rather than a strict E.164/area-code parse.
function isPlausiblePhoneNumber(value: string): boolean {
  if (!/^\+?[\d\s\-()]+$/.test(value)) return false;
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 9 && digitCount <= 12;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateQuoteRequest(
  input: unknown,
): QuoteRequestValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: { name: "Invalid request." } };
  }

  const record = input as Record<string, unknown>;
  const errors: QuoteRequestFieldErrors = {};

  const name = readTrimmedString(record.name);
  if (!name) {
    errors.name = "Please enter your name.";
  } else if (name.length > MAX_LENGTH.name) {
    errors.name = "Name is too long.";
  }

  const phone = readTrimmedString(record.phone);
  if (!phone) {
    errors.phone = "Please enter a mobile number.";
  } else if (phone.length > MAX_LENGTH.phone) {
    errors.phone = "Mobile number is too long.";
  } else if (!isPlausiblePhoneNumber(phone)) {
    errors.phone = "Please enter a valid South African mobile number.";
  }

  const service = readTrimmedString(record.service);
  if (!service) {
    errors.service = "Please choose a service.";
  } else if (!JOB_SERVICES.includes(service as JobService)) {
    errors.service = "Please choose a valid service.";
  }

  const area = readTrimmedString(record.area);
  if (!area) {
    errors.area = "Please enter your area or suburb.";
  } else if (area.length > MAX_LENGTH.area) {
    errors.area = "Area is too long.";
  }

  // For a structured request this field carries the customer's notes.
  const description = readTrimmedString(record.description);

  const submittedDetails =
    typeof record.details === "object" && record.details !== null
      ? (record.details as Partial<Record<DetailField, unknown>>)
      : {};
  const details = errors.service
    ? ({ mode: "unstructured" } as const)
    : validateServiceDetails(service as JobService, submittedDetails);

  if (details.mode === "invalid") {
    Object.assign(errors, details.errors);
  }

  if (details.mode !== "unstructured") {
    if (details.mode === "structured" && details.notesRequired && !description) {
      errors.description = "Please tell us a bit more about the job.";
    } else if (description.length > MAX_NOTES_LENGTH) {
      errors.description = "Notes are too long.";
    }
  } else if (!description) {
    errors.description = "Please tell us about the job.";
  } else if (description.length > MAX_LENGTH.description) {
    errors.description = "Description is too long.";
  }

  if (Object.keys(errors).length > 0 || details.mode === "invalid") {
    return { ok: false, errors };
  }

  const structured = details.mode === "structured";
  return {
    ok: true,
    data: {
      customerName: name,
      phone,
      service: service as JobService,
      area,
      description: structured ? composeDescription(details.answers, description) : description,
    },
    details: structured ? details.answers : null,
    notes: structured ? description || null : null,
  };
}
