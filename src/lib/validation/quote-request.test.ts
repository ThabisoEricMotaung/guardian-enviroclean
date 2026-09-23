import { describe, expect, it } from "vitest";
import { validateQuoteRequest } from "./quote-request";

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
