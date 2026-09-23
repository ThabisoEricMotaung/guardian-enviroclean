import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const insertWebsiteEnquiry = vi.fn();

vi.mock("@/lib/quote-requests", () => ({
  insertWebsiteEnquiry: (...args: unknown[]) => insertWebsiteEnquiry(...args),
}));

// vi.mock above is hoisted ahead of this import by vitest's transform, so
// route.ts's `@/lib/quote-requests` import resolves to the mock.
import { POST } from "./route";

const validBody = {
  name: "Jane Doe",
  phone: "0821234567",
  service: "MATTRESS",
  area: "Menlyn, Pretoria",
  description: "Queen mattress, some staining on one side.",
};

function jsonRequest(rawBody: string) {
  return new NextRequest("http://localhost/api/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("POST /api/quote-requests", () => {
  afterEach(() => {
    insertWebsiteEnquiry.mockReset();
  });

  it("accepts a valid request, inserts exactly one job, and returns a minimal success body", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({
      id: "11111111-1111-1111-1111-111111111111",
    });

    const response = await POST(jsonRequest(JSON.stringify(validBody)));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(insertWebsiteEnquiry).toHaveBeenCalledTimes(1);
    expect(insertWebsiteEnquiry).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      phone: "0821234567",
      service: "MATTRESS",
      area: "Menlyn, Pretoria",
      description: validBody.description,
    });
  });

  it("rejects a request missing a required field, without inserting", async () => {
    const response = await POST(
      jsonRequest(JSON.stringify({ ...validBody, name: "" })),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.fieldErrors.name).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("rejects an invalid service value, without inserting", async () => {
    const response = await POST(
      jsonRequest(JSON.stringify({ ...validBody, service: "POOL_CLEANING" })),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.fieldErrors.service).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, without inserting", async () => {
    const response = await POST(jsonRequest("{not valid json"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("returns a safe generic error and does not report success when the database insert fails", async () => {
    insertWebsiteEnquiry.mockRejectedValueOnce(
      new Error(
        'connection to server at "ep-example-pooler.c-2.us-east-2.aws.neon.tech" (10.0.0.1), port 5432 failed: FATAL: password authentication failed',
      ),
    );

    const response = await POST(jsonRequest(JSON.stringify(validBody)));
    const json = await response.json();

    // Failure semantics: never a success status/body ...
    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json).not.toHaveProperty("id");

    // ... and never the raw Postgres error leaked to the client.
    const raw = JSON.stringify(json);
    expect(raw).not.toMatch(/neon\.tech/i);
    expect(raw).not.toMatch(/FATAL/i);
    expect(raw).not.toMatch(/password authentication/i);
  });
});
