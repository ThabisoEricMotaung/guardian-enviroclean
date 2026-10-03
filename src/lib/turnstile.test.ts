import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted ahead of the import below by vitest's transform.
vi.mock("server-only", () => ({}));

import { verifyTurnstileToken } from "./turnstile";

const SECRET = "test-secret-value-should-never-leak";

function mockFetchOnce(response: { ok: boolean; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("verifyTurnstileToken", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("rejects a missing token without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when TURNSTILE_SECRET_KEY is not configured", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("some-token");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare reports as successful", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ success: true }) });

    const result = await verifyTurnstileToken("valid-token", "203.0.113.5");

    expect(result).toEqual({ ok: true });
  });

  it("sends secret, response, and remoteip as form-encoded fields", async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({ success: true }) });

    await verifyTurnstileToken("the-token", "203.0.113.5");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("the-token");
    expect(body.get("remoteip")).toBe("203.0.113.5");
  });

  it("rejects an invalid token", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    const result = await verifyTurnstileToken("bogus-token");

    expect(result).toEqual({ ok: false });
  });

  it("rejects an expired/replayed token (timeout-or-duplicate)", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });

    const result = await verifyTurnstileToken("replayed-token");

    expect(result).toEqual({ ok: false });
  });

  it("fails safely when Cloudflare returns a non-2xx status", async () => {
    mockFetchOnce({ ok: false, json: async () => ({}) });

    const result = await verifyTurnstileToken("some-token");

    expect(result).toEqual({ ok: false });
  });

  it("fails safely when the verification request throws (network failure)", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken("some-token");

    expect(result).toEqual({ ok: false });
  });

  it("never logs the secret or the full token", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    await verifyTurnstileToken("a-real-looking-token-value-12345");

    const loggedText = consoleErrorSpy.mock.calls.map((args) => JSON.stringify(args)).join(" ");
    expect(loggedText).not.toContain(SECRET);
    expect(loggedText).not.toContain("a-real-looking-token-value-12345");
  });
});
