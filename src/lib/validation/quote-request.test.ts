import { describe, expect, it } from "vitest";
import { validateQuoteRequest } from "./quote-request";
import { DETAIL_FIELDS, MAX_NOTES_LENGTH } from "../quote-details";

const validInput = {
  name: "Jane Doe",
  phone: "082 123 4567",
  service: "MATTRESS",
  area: "Menlyn, Pretoria",
  description: "Queen mattress, some staining on one side.",
};

describe("validateQuoteRequest", () => {
  it("accepts a valid request and trims whitespace", () => {
    const result = validateQuoteRequest({
      ...validInput,
      name: "  Jane Doe  ",
      area: "  Menlyn, Pretoria  ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        customerName: "Jane Doe",
        phone: "082 123 4567",
        service: "MATTRESS",
        area: "Menlyn, Pretoria",
        description: validInput.description,
      });
    }
  });

  it("accepts an internationally formatted phone number", () => {
    const result = validateQuoteRequest({ ...validInput, phone: "+27 82 123 4567" });
    expect(result.ok).toBe(true);
  });

  it.each(["name", "phone", "service", "area", "description"] as const)(
    "rejects a missing required field: %s",
    (field) => {
      const rest = { ...validInput };
      delete rest[field];
      const result = validateQuoteRequest(rest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[field === "name" ? "name" : field]).toBeTruthy();
      }
    },
  );

  it("rejects an invalid service value", () => {
    const result = validateQuoteRequest({ ...validInput, service: "POOL_CLEANING" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.service).toBeTruthy();
    }
  });

  it.each(["name", "phone", "area", "description"] as const)(
    "rejects a whitespace-only required field: %s",
    (field) => {
      const result = validateQuoteRequest({ ...validInput, [field]: "   " });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[field]).toBeTruthy();
      }
    },
  );

  it("rejects an oversized name", () => {
    const result = validateQuoteRequest({ ...validInput, name: "A".repeat(201) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeTruthy();
    }
  });

  it("rejects an oversized description", () => {
    const result = validateQuoteRequest({ ...validInput, description: "A".repeat(2001) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.description).toBeTruthy();
    }
  });

  it("rejects an implausible phone number", () => {
    const result = validateQuoteRequest({ ...validInput, phone: "not a phone number" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.phone).toBeTruthy();
    }
  });

  it.each([null, undefined, "a string body", 42, ["array", "body"]])(
    "rejects a malformed (non-object) request body: %j",
    (malformed) => {
      const result = validateQuoteRequest(malformed);
      expect(result.ok).toBe(false);
    },
  );
});

describe("validateQuoteRequest — structured details", () => {
  const sofa = {
    ...validInput,
    service: "SOFA_COUCH",
    description: "Red wine stain on one cushion.",
    details: { sofa_type: "three_seater", sofa_material: "leather" },
  };

  it("composes the persisted description from validated labels plus notes", () => {
    const result = validateQuoteRequest(sofa);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe(
        "Sofa type: 3 seater\nMaterial: Leather\nNotes: Red wine stain on one cushion.",
      );
      expect(result.details?.map((d) => [d.label, d.value])).toEqual([
        ["Sofa type", "3 seater"],
        ["Material", "Leather"],
      ]);
      expect(result.notes).toBe("Red wine stain on one cushion.");
    }
  });

  it("accepts a structured request without notes and persists no filler", () => {
    const result = validateQuoteRequest({ ...sofa, description: "  " });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe("Sofa type: 3 seater\nMaterial: Leather");
      expect(result.notes).toBeNull();
    }
  });

  it("accepts Not sure as a complete answer without notes", () => {
    const result = validateQuoteRequest({
      ...validInput,
      service: "CAR_INTERIOR",
      description: "",
      details: { car_vehicle: "not_sure", car_seats: "not_sure" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe("Vehicle type: Not sure\nSeat material: Not sure");
    }
  });

  it("requires notes when an answer is Other", () => {
    const result = validateQuoteRequest({
      ...validInput,
      description: "",
      details: { mattress_size: "other" },
    });

    expect(result).toEqual({
      ok: false,
      errors: { description: "Please tell us a bit more about the job." },
    });
  });

  it("accepts Other once notes are given", () => {
    const result = validateQuoteRequest({
      ...validInput,
      description: "Cot mattress",
      details: { mattress_size: "other" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.description).toBe("Mattress size: Other\nNotes: Cot mattress");
  });

  it("caps structured notes so the composed description stays within 2,000 characters", () => {
    const atLimit = validateQuoteRequest({ ...sofa, description: "x".repeat(MAX_NOTES_LENGTH) });
    expect(atLimit.ok).toBe(true);
    if (atLimit.ok) expect(atLimit.data.description.length).toBeLessThanOrEqual(2000);

    const over = validateQuoteRequest({ ...sofa, description: "x".repeat(MAX_NOTES_LENGTH + 1) });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.description).toBe("Notes are too long.");
  });

  it("keeps customer text out of the structured lines", () => {
    const result = validateQuoteRequest({ ...sofa, description: "Sofa type: King\nMaterial: Gold" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe(
        "Sofa type: 3 seater\nMaterial: Leather\nNotes: Sofa type: King\nMaterial: Gold",
      );
    }
  });

  it("rejects a tampered code and never persists it", () => {
    const result = validateQuoteRequest({
      ...sofa,
      details: { sofa_type: "throne", sofa_material: "leather" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sofa_type).toBeTruthy();
  });

  it("rejects a stale detail from a previously chosen service", () => {
    const result = validateQuoteRequest({
      ...sofa,
      details: { ...sofa.details, mattress_size: "queen" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.service).toBeTruthy();
  });

  it("does not let a partially structured request fall back to the legacy path", () => {
    // A description is present, which would satisfy the legacy rule —
    // but a detail field was sent, so the structured rules apply.
    const result = validateQuoteRequest({ ...sofa, details: { sofa_type: "three_seater" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.sofa_material).toBe("Please choose the material.");
      expect(result.errors.description).toBeUndefined();
    }
  });

  it("does not demand a description when the only problem is a missing answer", () => {
    const result = validateQuoteRequest({ ...validInput, description: "", details: { mattress_size: "" } });

    expect(result).toEqual({ ok: false, errors: { mattress_size: "Please choose the mattress size." } });
  });
});

describe("validateQuoteRequest — legacy request shape (no detail fields)", () => {
  it.each(["MATTRESS", "SOFA_COUCH", "CAR_INTERIOR", "CARPET_RUG", "OTHER"])(
    "accepts %s with only a free-text description, persisted verbatim",
    (service) => {
      const result = validateQuoteRequest({
        ...validInput,
        service,
        details: Object.fromEntries(DETAIL_FIELDS.map((field) => [field, null])),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.description).toBe(validInput.description);
        expect(result.details).toBeNull();
        expect(result.notes).toBeNull();
      }
    },
  );

  it("still requires the description on the legacy path", () => {
    const result = validateQuoteRequest({ ...validInput, description: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBe("Please tell us about the job.");
  });

  it("keeps the 2,000-character limit for a legacy / OTHER description", () => {
    expect(validateQuoteRequest({ ...validInput, service: "OTHER", description: "x".repeat(2000) }).ok).toBe(
      true,
    );
  });
});
