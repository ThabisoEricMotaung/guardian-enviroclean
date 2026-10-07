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
  acquisition: { channel: null, detail: null },
  details: null,
  notes: null,
} as const;

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
    expect(call.subject).toBe("New Guardian quote request — Mattress");
    expect(call.text).toContain("Jane Doe");
    expect(call.text).toContain("0821234567");
    expect(call.text).toContain("Service: Mattress\n");
    expect(call.text).not.toContain("MATTRESS");
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

  it.each([
    ["page_button", "Acquisition: Facebook · Page button"],
    ["post", "Acquisition: Facebook · Post"],
    ["bio", "Acquisition: Facebook · Bio"],
  ] as const)("adds a readable acquisition line for Facebook %s", async (detail, line) => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry({ ...baseInput, acquisition: { channel: "FACEBOOK", detail } });

    const { text } = sendMock.mock.calls[0][0];
    expect(text).toContain(`Source: Website\n${line}`);
    expect(text).not.toContain(detail);
  });

  it("shows Facebook without a placement when the tagged link had none", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry({
      ...baseInput,
      acquisition: { channel: "FACEBOOK", detail: null },
    });

    const { text } = sendMock.mock.calls[0][0];
    expect(text).toMatch(/Source: Website\nAcquisition: Facebook$/);
  });

  it("omits the acquisition line entirely for an unattributed enquiry", async () => {
    configureEnv();
    sendMock.mockResolvedValueOnce({ data: { id: "abc" }, error: null });

    await notifyCecilOfEnquiry(baseInput);

    const { text } = sendMock.mock.calls[0][0];
    expect(text).toMatch(/Source: Website$/);
    expect(text).not.toMatch(/Acquisition|NULL|Unknown|Direct|utm_|fbclid/i);
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

describe("notifyCecilOfEnquiry — structured details", () => {
  const sofa = {
    ...baseInput,
    service: "SOFA_COUCH",
    description: "Sofa type: 3 seater\nMaterial: Leather\nNotes: Red wine stain on one cushion.",
    details: [
      { field: "sofa_type", label: "Sofa type", code: "three_seater", value: "3 seater" },
      { field: "sofa_material", label: "Material", code: "leather", value: "Leather" },
    ],
    notes: "Red wine stain on one cushion.",
  } as const;

  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CECIL_NOTIFICATION_EMAIL", "cecil@guardianenviroclean.example");
    vi.stubEnv("RESEND_FROM_EMAIL", "quotes@guardianenviroclean.example");
    sendMock.mockResolvedValue({ data: { id: "abc" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists readable details in the body and keeps the subject concise", async () => {
    await notifyCecilOfEnquiry(sofa);

    const { subject, text } = sendMock.mock.calls[0][0];
    expect(subject).toBe("New Guardian quote request — Sofa & couch");
    expect(text).toBe(
      [
        "New quote request from Jane Doe",
        "",
        "Phone: 0821234567",
        "Service: Sofa & couch",
        "Sofa type: 3 seater",
        "Material: Leather",
        "Area: Menlyn, Pretoria",
        "",
        "Notes:",
        "Red wine stain on one cushion.",
        "",
        "Photos: none attached.",
        "Source: Website",
      ].join("\n"),
    );
    expect(text).not.toMatch(/three_seater|SOFA_COUCH|Description:/);
  });

  it("shows None given. in the email when no notes were supplied", async () => {
    await notifyCecilOfEnquiry({ ...sofa, notes: null });

    expect(sendMock.mock.calls[0][0].text).toContain("Notes:\nNone given.\n");
  });

  it("keeps the Facebook acquisition line after the structured details", async () => {
    await notifyCecilOfEnquiry({ ...sofa, acquisition: { channel: "FACEBOOK", detail: "post" } });

    expect(sendMock.mock.calls[0][0].text).toMatch(/Source: Website\nAcquisition: Facebook · Post$/);
  });

  it.each([
    ["MATTRESS", "Mattress"],
    ["CARPET_RUG", "Carpet & rug"],
    ["CAR_INTERIOR", "Car interior"],
    ["OTHER", "Other / not sure"],
  ] as const)("uses a readable label for %s and the Description block when unstructured", async (service, label) => {
    await notifyCecilOfEnquiry({ ...baseInput, service });

    const { subject, text } = sendMock.mock.calls[0][0];
    expect(subject).toBe(`New Guardian quote request — ${label}`);
    expect(text).toContain(
      `Service: ${label}\nArea: Menlyn, Pretoria\n\nDescription:\nQueen mattress, some staining.`,
    );
  });
});
