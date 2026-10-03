import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => sendMock(...args) },
  })),
}));

const { notifyCecilOfEnquiry } = await import("./notifications");

const baseInput = {
  customerName: "Jane Doe",
  phone: "0821234567",
  service: "MATTRESS",
  area: "Menlyn, Pretoria",
  description: "Queen mattress, some staining.",
  photosRequested: 0,
  photosAccepted: 0,
};

describe("notifyCecilOfEnquiry", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleErrorSpy.mockRestore();
  });

  function configureEnv() {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CECIL_NOTIFICATION_EMAIL", "cecil@guardianenviroclean.example");
    vi.stubEnv("RESEND_FROM_EMAIL", "quotes@guardianenviroclean.example");
  }

  it("skips sending when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("CECIL_NOTIFICATION_EMAIL", "cecil@guardianenviroclean.example");
    vi.stubEnv("RESEND_FROM_EMAIL", "quotes@guardianenviroclean.example");

    await notifyCecilOfEnquiry(baseInput);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips sending when CECIL_NOTIFICATION_EMAIL is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "quotes@guardianenviroclean.example");

    await notifyCecilOfEnquiry(baseInput);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips sending when RESEND_FROM_EMAIL is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CECIL_NOTIFICATION_EMAIL", "cecil@guardianenviroclean.example");

    await notifyCecilOfEnquiry(baseInput);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends to the configured recipient with the expected fields, ignoring nothing client-controlled", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry({
      ...baseInput,
      photosRequested: 2,
      photosAccepted: 1,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toEqual(["cecil@guardianenviroclean.example"]);
    expect(call.from).toBe("quotes@guardianenviroclean.example");
    expect(call.subject).toBe("New Guardian quote request — MATTRESS");
    expect(call.text).toContain("Jane Doe");
    expect(call.text).toContain("0821234567");
    expect(call.text).toContain("MATTRESS");
    expect(call.text).toContain("Menlyn, Pretoria");
    expect(call.text).toContain("Queen mattress, some staining.");
    expect(call.text).toContain("Photos: 1 of 2 received successfully.");
    expect(call.text).toContain("Source: Website");
  });

  it("reports no photos plainly when none were requested", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry(baseInput);

    const call = sendMock.mock.calls[0][0];
    expect(call.text).toContain("Photos: none attached.");
  });

  it("never includes a storage path, key, or URL in the email content", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry({ ...baseInput, photosRequested: 1, photosAccepted: 1 });

    const call = sendMock.mock.calls[0][0];
    const content = `${call.subject}\n${call.text}`;
    expect(content).not.toMatch(/quote-requests\//);
    expect(content).not.toMatch(/https?:\/\//);
    expect(content).not.toMatch(/AWS_|AKIA/);
  });

  it("swallows a Resend-reported error without throwing", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "domain not verified", name: "validation_error" },
    });

    await expect(notifyCecilOfEnquiry(baseInput)).resolves.toBeUndefined();
  });

  it("swallows a thrown network failure without throwing", async () => {
    configureEnv();
    sendMock.mockRejectedValueOnce(new Error("network down"));

    await expect(notifyCecilOfEnquiry(baseInput)).resolves.toBeUndefined();
  });
});
