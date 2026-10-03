"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PHONE_INTL_DISPLAY, whatsappLink } from "@/lib/contact";
import { QuoteRequestSuccess } from "@/components/quote-request-success";
import type { QuoteRequestFieldErrors } from "@/lib/validation/quote-request";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES } from "@/lib/validation/photo";

const SERVICE_OPTIONS = [
  { value: "MATTRESS", label: "Mattress Cleaning" },
  { value: "SOFA_COUCH", label: "Sofa & Couch Cleaning" },
  { value: "CARPET_RUG", label: "Carpet & Rug Cleaning" },
  { value: "CAR_INTERIOR", label: "Car Interior Cleaning" },
  { value: "OTHER", label: "Other / Not Sure" },
] as const;

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const fieldClasses =
  "mt-1 w-full rounded-[3px] border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--guardian-deep)] focus:outline-none";

const fieldErrorClasses = "mt-1.5 text-sm text-red-600";

export function RequestQuoteForm() {
  const serviceGroupName = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [service, setService] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<QuoteRequestFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const [photoIssue, setPhotoIssue] = useState(false);

  // Revoke object URLs on unmount/replace so we don't leak memory during
  // a long session — these are local previews only; the actual files
  // are read fresh from `photos` state and sent on submit.
  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addPhotos(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photos.length;
    const accepted = incoming.slice(0, room);

    setPhotos((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const area = String(formData.get("area") ?? "");
    const description = String(formData.get("description") ?? "");

    setServerError(null);

    if (!service) {
      setFieldErrors({ service: "Please choose a service." });
      return;
    }
    setFieldErrors({});
    setStatus("submitting");

    const requestBody = new FormData();
    requestBody.append("name", name);
    requestBody.append("phone", phone);
    requestBody.append("service", service);
    requestBody.append("area", area);
    requestBody.append("description", description);
    for (const photo of photos) {
      requestBody.append("photos", photo.file, photo.file.name);
    }

    try {
      // No Content-Type header — the browser sets the multipart
      // boundary itself. Setting it manually here would break parsing.
      // basePath is not applied to fetch(); prefix it for sub-path deployments.
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote-requests`, {
        method: "POST",
        body: requestBody,
      });
      const payload: {
        ok?: boolean;
        error?: string;
        fieldErrors?: QuoteRequestFieldErrors;
        photos?: { requested: number; accepted: number };
      } | null = await response.json().catch(() => null);

      if (response.ok && payload?.ok) {
        const requested = payload.photos?.requested ?? 0;
        const accepted = payload.photos?.accepted ?? 0;
        setPhotoIssue(requested > accepted);
        setSubmittedName(name.trim());
        setStatus("success");
        return;
      }

      if (response.status === 422 && payload?.fieldErrors) {
        setFieldErrors(payload.fieldErrors);
        setStatus("idle");
        return;
      }

      setServerError(
        payload?.error ??
          "Something went wrong. Please try again or message us on WhatsApp.",
      );
      setStatus("error");
    } catch {
      setServerError(
        "Something went wrong. Please try again or message us on WhatsApp.",
      );
      setStatus("error");
    }
  }

  if (status === "success" && submittedName) {
    return <QuoteRequestSuccess name={submittedName} photoIssue={photoIssue} />;
  }

  return (
    <form className="mt-10 space-y-10" onSubmit={handleSubmit} noValidate>
      {/* Section 1 — Your details */}
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.14em] text-[var(--guardian-deep)] uppercase">
          Your Details
        </legend>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--foreground)]">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
              required
              maxLength={200}
              className={fieldClasses}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
            />
            {fieldErrors.name && (
              <p id="name-error" className={fieldErrorClasses}>
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-[var(--foreground)]">
              Mobile number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="082 123 4567"
              required
              maxLength={30}
              className={fieldClasses}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            />
            {fieldErrors.phone && (
              <p id="phone-error" className={fieldErrorClasses}>
                {fieldErrors.phone}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Section 2 — Service */}
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.14em] text-[var(--guardian-deep)] uppercase">
          What Needs Cleaning?
        </legend>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SERVICE_OPTIONS.map((option) => {
            const checked = service === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-[3px] border px-4 py-3 text-sm transition ${
                  checked
                    ? "border-[var(--guardian-deep)] bg-[var(--guardian-deep)]/[0.05] text-[var(--foreground)]"
                    : "border-[var(--line)] text-[var(--foreground)] hover:border-[var(--foreground)]/40"
                }`}
              >
                <input
                  type="radio"
                  name={serviceGroupName}
                  value={option.value}
                  checked={checked}
                  onChange={() => setService(option.value)}
                  className="h-4 w-4 shrink-0 accent-[var(--guardian-deep)]"
                />
                {option.label}
              </label>
            );
          })}
        </div>
        {fieldErrors.service && (
          <p className={fieldErrorClasses}>{fieldErrors.service}</p>
        )}
      </fieldset>

      {/* Section 3 — Area */}
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.14em] text-[var(--guardian-deep)] uppercase">
          Where Are You?
        </legend>
        <div className="mt-4">
          <label htmlFor="area" className="block text-sm font-medium text-[var(--foreground)]">
            Area / suburb
          </label>
          <input
            id="area"
            name="area"
            type="text"
            placeholder="e.g. Menlyn, Pretoria"
            required
            maxLength={200}
            className={fieldClasses}
            aria-invalid={Boolean(fieldErrors.area)}
            aria-describedby={fieldErrors.area ? "area-error" : undefined}
          />
          {fieldErrors.area && (
            <p id="area-error" className={fieldErrorClasses}>
              {fieldErrors.area}
            </p>
          )}
        </div>
      </fieldset>

      {/* Section 4 — Job description */}
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.14em] text-[var(--guardian-deep)] uppercase">
          Tell Us About The Job
        </legend>
        <div className="mt-4">
          <textarea
            name="description"
            rows={4}
            placeholder="e.g. 3-seater couch and two chairs, with some stains on the cushions."
            required
            maxLength={2000}
            className={fieldClasses}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? "description-error" : undefined}
          />
          {fieldErrors.description && (
            <p id="description-error" className={fieldErrorClasses}>
              {fieldErrors.description}
            </p>
          )}
        </div>
      </fieldset>

      {/* Section 5 — Photos */}
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.14em] text-[var(--guardian-deep)] uppercase">
          Add Photos
        </legend>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Photos help us understand the job and prepare your quote. JPEG,
          PNG or WebP, up to {MAX_PHOTO_BYTES / (1024 * 1024)} MB each (
          {MAX_TOTAL_PHOTO_BYTES / (1024 * 1024)} MB total for all photos).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-[3px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-semibold text-white transition hover:bg-black/80"
              >
                ×
              </button>
            </div>
          ))}

          {photos.length < MAX_PHOTOS && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[3px] border border-dashed border-[var(--line)] px-2 text-center text-[var(--muted)] transition hover:border-[var(--foreground)]/40">
              <span aria-hidden className="text-2xl leading-none">
                +
              </span>
              <span className="text-xs">
                {photos.length === 0 ? "Add up to 4 photos" : "Add another"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => addPhotos(event.target.files)}
                className="sr-only"
              />
            </label>
          )}
        </div>
      </fieldset>

      {/* Submit */}
      <div>
        {serverError && (
          <p
            role="alert"
            className="mb-3 rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={status === "submitting"}
          aria-disabled={status === "submitting"}
          className="w-full rounded-[3px] bg-[var(--guardian-deep)] px-6 py-3 text-sm font-medium tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Send Quote Request"}
        </button>
        <p className="mt-3 text-center text-sm text-[var(--muted)]">
          Prefer WhatsApp?{" "}
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--guardian-deep)] underline underline-offset-2"
          >
            Message us directly
          </a>{" "}
          ({PHONE_INTL_DISPLAY}).
        </p>
      </div>
    </form>
  );
}
