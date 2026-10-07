import { describe, expect, it } from "vitest";
import {
  DETAIL_FIELDS,
  MAX_NOTES_LENGTH,
  SERVICE_LABELS,
  SERVICE_QUESTIONS,
  composeDescription,
  validateServiceDetails,
  type DetailField,
} from "./quote-details";
import { JOB_SERVICES, type JobService } from "./validation/quote-request";

const STRUCTURED: JobService[] = ["MATTRESS", "SOFA_COUCH", "CAR_INTERIOR", "CARPET_RUG"];

// Every question for `service` answered with `code` where it exists,
// otherwise that question's first option.
function answersFor(service: JobService, overrides: Partial<Record<DetailField, string>> = {}) {
  return Object.fromEntries(
    SERVICE_QUESTIONS[service].map((q) => [q.field, overrides[q.field] ?? q.options[0].code]),
  );
}

describe("SERVICE_QUESTIONS (canonical definitions)", () => {
  it("defines exactly the approved questions and options", () => {
    const summary = Object.fromEntries(
      JOB_SERVICES.map((service) => [
        service,
        SERVICE_QUESTIONS[service].map((q) => [q.label, q.options.map((o) => o.label)]),
      ]),
    );
    expect(summary).toEqual({
      MATTRESS: [
        ["Mattress size", ["Single", "Three-quarter", "Double", "Queen", "King", "Other", "Not sure"]],
      ],
      SOFA_COUCH: [
        [
          "Sofa type",
          ["Armchair / 1 seater", "2 seater", "3 seater", "4+ seater", "L-shape / corner", "Lounge suite", "Other", "Not sure"],
        ],
        ["Material", ["Fabric", "Leather", "Suede / microsuede", "Not sure"]],
      ],
      CAR_INTERIOR: [
        ["Vehicle type", ["Hatchback", "Sedan", "SUV / crossover", "Bakkie", "7-seater / minibus", "Other", "Not sure"]],
        ["Seat material", ["Cloth", "Leather", "Not sure"]],
      ],
      CARPET_RUG: [
        [
          "Carpet / rug size",
          [
            "Small — up to about 1.2 × 1.8 m",
            "Medium — about 1.6 × 2.3 m",
            "Large — 2 × 3 m or bigger",
            "Fitted carpet",
            "Other",
            "Not sure",
          ],
        ],
      ],
      OTHER: [],
    });
  });

  it("uses every detail field exactly once and unique codes per question", () => {
    const fields = JOB_SERVICES.flatMap((s) => SERVICE_QUESTIONS[s].map((q) => q.field));
    expect([...fields].sort()).toEqual([...DETAIL_FIELDS].sort());
    for (const service of JOB_SERVICES) {
      for (const q of SERVICE_QUESTIONS[service]) {
        const codes = q.options.map((o) => o.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes).toContain("not_sure");
      }
    }
  });

  it("has a readable label for every service", () => {
    expect(SERVICE_LABELS).toEqual({
      MATTRESS: "Mattress",
      SOFA_COUCH: "Sofa & couch",
      CARPET_RUG: "Carpet & rug",
      CAR_INTERIOR: "Car interior",
      OTHER: "Other / not sure",
    });
  });
});

describe("validateServiceDetails", () => {
  it.each(
    STRUCTURED.flatMap((service) =>
      SERVICE_QUESTIONS[service].flatMap((q) =>
        q.options.map((o) => [service, q.field, o.code, o.label] as const),
      ),
    ),
  )("accepts %s %s=%s", (service, field, code, label) => {
    const result = validateServiceDetails(service, answersFor(service, { [field]: code }));
    expect(result.mode).toBe("structured");
    if (result.mode === "structured") {
      expect(result.answers.find((a) => a.field === field)?.value).toBe(label);
    }
  });

  it("treats a request with every detail field absent as unstructured (legacy shape / OTHER)", () => {
    for (const service of JOB_SERVICES) {
      expect(validateServiceDetails(service, {})).toEqual({ mode: "unstructured" });
      expect(
        validateServiceDetails(service, Object.fromEntries(DETAIL_FIELDS.map((f) => [f, null]))),
      ).toEqual({ mode: "unstructured" });
    }
  });

  it.each(STRUCTURED.flatMap((s) => SERVICE_QUESTIONS[s].map((q) => [s, q.field] as const)))(
    "requires %s %s (empty answer is not a legacy fallback)",
    (service, field) => {
      const result = validateServiceDetails(service, answersFor(service, { [field]: "" }));
      expect(result.mode).toBe("invalid");
      if (result.mode === "invalid") expect(result.errors[field]).toBeTruthy();
    },
  );

  it("rejects a partially supplied structured request instead of falling back to legacy", () => {
    const result = validateServiceDetails("SOFA_COUCH", { sofa_type: "three_seater" });
    expect(result).toEqual({
      mode: "invalid",
      errors: { sofa_material: "Please choose the material." },
    });
  });

  it.each(["QUEEN", "queen ", "Queen", "super_king", "<script>", "not sure", "1", ""])(
    "rejects tampered/unrecognised code %j",
    (code) => {
      const result = validateServiceDetails("MATTRESS", { mattress_size: code });
      // "queen " is trimmed to a valid code; everything else is invalid.
      if (code === "queen ") {
        expect(result.mode).toBe("structured");
      } else {
        expect(result.mode).toBe("invalid");
      }
    },
  );

  it.each([42, {}, ["queen"], true])("rejects a non-string value %j", (value) => {
    expect(validateServiceDetails("MATTRESS", { mattress_size: value }).mode).toBe("invalid");
  });

  it("rejects a stale detail belonging to a different service", () => {
    const result = validateServiceDetails("MATTRESS", {
      mattress_size: "queen",
      car_vehicle: "sedan",
    });
    expect(result.mode).toBe("invalid");
    if (result.mode === "invalid") expect(result.errors.service).toBeTruthy();
  });

  it("rejects any detail field submitted with the OTHER service", () => {
    const result = validateServiceDetails("OTHER", { rug_size: "small" });
    expect(result.mode).toBe("invalid");
  });

  it("does not require notes for Not sure", () => {
    const result = validateServiceDetails("CAR_INTERIOR", {
      car_vehicle: "not_sure",
      car_seats: "not_sure",
    });
    expect(result).toMatchObject({ mode: "structured", notesRequired: false });
  });

  it.each([
    ["MATTRESS", { mattress_size: "other" }],
    ["SOFA_COUCH", { sofa_type: "other", sofa_material: "fabric" }],
    ["CAR_INTERIOR", { car_vehicle: "other", car_seats: "cloth" }],
    ["CARPET_RUG", { rug_size: "other" }],
  ] as const)("requires notes when %s has an Other answer", (service, submitted) => {
    expect(validateServiceDetails(service, submitted)).toMatchObject({
      mode: "structured",
      notesRequired: true,
    });
  });
});

describe("composeDescription", () => {
  it("composes fixed label lines followed by the customer's notes", () => {
    const result = validateServiceDetails("SOFA_COUCH", {
      sofa_type: "three_seater",
      sofa_material: "leather",
    });
    if (result.mode !== "structured") throw new Error("expected structured");
    expect(composeDescription(result.answers, "Red wine stain on one cushion.")).toBe(
      "Sofa type: 3 seater\nMaterial: Leather\nNotes: Red wine stain on one cushion.",
    );
    expect(composeDescription(result.answers, "")).toBe("Sofa type: 3 seater\nMaterial: Leather");
  });

  it("never exceeds the 2,000-character description limit for the longest answers and notes", () => {
    for (const service of STRUCTURED) {
      const longest = Object.fromEntries(
        SERVICE_QUESTIONS[service].map((q) => [
          q.field,
          [...q.options].sort((a, b) => b.label.length - a.label.length)[0].code,
        ]),
      );
      const result = validateServiceDetails(service, longest);
      if (result.mode !== "structured") throw new Error("expected structured");
      expect(composeDescription(result.answers, "x".repeat(MAX_NOTES_LENGTH)).length).toBeLessThanOrEqual(
        2000,
      );
    }
  });
});
