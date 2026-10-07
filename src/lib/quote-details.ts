// Structured quote details: the per-service questions the public form
// asks after the customer picks a service. This module is the single
// canonical definition of the questions, their allowed answer codes and
// the display labels. It's shared by the browser (rendering the choices)
// and the server (validation + composing the persisted description).
//
// Persistence deliberately reuses `jobs.description` (no migration): the
// server composes a fixed, human-readable summary from these labels plus
// the customer's notes. Nothing may parse that text back — if the Job
// Manager ever needs to filter/report by these answers, that's the point
// to add structured storage. See docs/neon-foundation.md, "Structured
// quote details".

import type { JobService } from "./validation/quote-request";

export type DetailOption = { readonly code: string; readonly label: string };

export type DetailQuestion = {
  // Wire field name submitted by the form.
  readonly field: DetailField;
  // Used as the form legend, the persisted line label and the email label.
  readonly label: string;
  readonly requiredMessage: string;
  readonly options: readonly DetailOption[];
};

export const DETAIL_FIELDS = [
  "mattress_size",
  "sofa_type",
  "sofa_material",
  "car_vehicle",
  "car_seats",
  "rug_size",
] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

// Selecting this code on any question makes the notes required.
export const OTHER_CODE = "other";
const NOT_SURE: DetailOption = { code: "not_sure", label: "Not sure" };
const OTHER: DetailOption = { code: OTHER_CODE, label: "Other" };

export const SERVICE_QUESTIONS: Readonly<Record<JobService, readonly DetailQuestion[]>> = {
  MATTRESS: [
    {
      field: "mattress_size",
      label: "Mattress size",
      requiredMessage: "Please choose the mattress size.",
      options: [
        { code: "single", label: "Single" },
        { code: "three_quarter", label: "Three-quarter" },
        { code: "double", label: "Double" },
        { code: "queen", label: "Queen" },
        { code: "king", label: "King" },
        OTHER,
        NOT_SURE,
      ],
    },
  ],
  SOFA_COUCH: [
    {
      field: "sofa_type",
      label: "Sofa type",
      requiredMessage: "Please choose the sofa type.",
      options: [
        { code: "armchair", label: "Armchair / 1 seater" },
        { code: "two_seater", label: "2 seater" },
        { code: "three_seater", label: "3 seater" },
        { code: "four_plus_seater", label: "4+ seater" },
        { code: "l_shape", label: "L-shape / corner" },
        { code: "lounge_suite", label: "Lounge suite" },
        OTHER,
        NOT_SURE,
      ],
    },
    {
      field: "sofa_material",
      label: "Material",
      requiredMessage: "Please choose the material.",
      options: [
        { code: "fabric", label: "Fabric" },
        { code: "leather", label: "Leather" },
        { code: "suede", label: "Suede / microsuede" },
        NOT_SURE,
      ],
    },
  ],
  CAR_INTERIOR: [
    {
      field: "car_vehicle",
      label: "Vehicle type",
      requiredMessage: "Please choose the vehicle type.",
      options: [
        { code: "hatchback", label: "Hatchback" },
        { code: "sedan", label: "Sedan" },
        { code: "suv", label: "SUV / crossover" },
        { code: "bakkie", label: "Bakkie" },
        { code: "seven_seater", label: "7-seater / minibus" },
        OTHER,
        NOT_SURE,
      ],
    },
    {
      field: "car_seats",
      label: "Seat material",
      requiredMessage: "Please choose the seat material.",
      options: [
        { code: "cloth", label: "Cloth" },
        { code: "leather", label: "Leather" },
        NOT_SURE,
      ],
    },
  ],
  CARPET_RUG: [
    {
      field: "rug_size",
      label: "Carpet / rug size",
      requiredMessage: "Please choose the carpet or rug size.",
      options: [
        { code: "small", label: "Small — up to about 1.2 × 1.8 m" },
        { code: "medium", label: "Medium — about 1.6 × 2.3 m" },
        { code: "large", label: "Large — 2 × 3 m or bigger" },
        { code: "fitted", label: "Fitted carpet" },
        OTHER,
        NOT_SURE,
      ],
    },
  ],
  // Free-text description stays primary for anything else.
  OTHER: [],
};

// Human-readable service names for Cecil's notification email.
export const SERVICE_LABELS: Readonly<Record<JobService, string>> = {
  MATTRESS: "Mattress",
  SOFA_COUCH: "Sofa & couch",
  CARPET_RUG: "Carpet & rug",
  CAR_INTERIOR: "Car interior",
  OTHER: "Other / not sure",
};

// Leaves room for the longest structured lines so the composed
// description always fits the existing 2,000-character description limit.
export const MAX_NOTES_LENGTH = 1800;

export type DetailAnswer = {
  readonly field: DetailField;
  readonly label: string;
  readonly code: string;
  readonly value: string;
};

export type DetailFieldErrors = Partial<Record<DetailField | "service", string>>;

export type ServiceDetailsResult =
  // No new detail field submitted at all: OTHER, or the legacy request
  // shape from a browser still running the pre-structured form. The
  // existing free-text description rules apply.
  | { mode: "unstructured" }
  | { mode: "structured"; answers: DetailAnswer[]; notesRequired: boolean }
  | { mode: "invalid"; errors: DetailFieldErrors };

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

// Untrusted submitted values → validated answers. "Absent" means the key
// wasn't sent at all; the current form always sends every question for
// the chosen service (empty if unanswered), so a partially answered
// structured request is rejected rather than treated as legacy.
export function validateServiceDetails(
  service: JobService,
  submitted: Partial<Record<DetailField, unknown>>,
): ServiceDetailsResult {
  if (DETAIL_FIELDS.every((field) => isAbsent(submitted[field]))) {
    return { mode: "unstructured" };
  }

  const questions = SERVICE_QUESTIONS[service];
  const errors: DetailFieldErrors = {};

  // A detail belonging to a different service (stale state or tampering)
  // is never silently dropped or persisted.
  const relevant = new Set<DetailField>(questions.map((q) => q.field));
  if (DETAIL_FIELDS.some((field) => !relevant.has(field) && !isAbsent(submitted[field]))) {
    errors.service = "Please choose the service again and answer its questions.";
  }

  const answers: DetailAnswer[] = [];
  for (const question of questions) {
    const raw = submitted[question.field];
    const code = typeof raw === "string" ? raw.trim() : "";
    if (!code) {
      errors[question.field] = question.requiredMessage;
      continue;
    }
    const option = question.options.find((o) => o.code === code);
    if (!option) {
      errors[question.field] = "Please choose one of the listed options.";
      continue;
    }
    answers.push({ field: question.field, label: question.label, code, value: option.label });
  }

  if (Object.keys(errors).length > 0) return { mode: "invalid", errors };
  return {
    mode: "structured",
    answers,
    notesRequired: answers.some((answer) => answer.code === OTHER_CODE),
  };
}

// The persisted `jobs.description` for a structured request. Only fixed
// labels populate the structured lines; customer text appears only after
// "Notes:".
export function composeDescription(answers: readonly DetailAnswer[], notes: string): string {
  const lines = answers.map((answer) => `${answer.label}: ${answer.value}`);
  if (notes) lines.push(`Notes: ${notes}`);
  return lines.join("\n");
}
