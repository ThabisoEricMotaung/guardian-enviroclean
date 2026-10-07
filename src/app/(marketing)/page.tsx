import Image from "next/image";
import { CtaButton } from "@/components/cta-button";
import { HeroSlideshow } from "@/components/hero-slideshow";
import { ScrollReveal } from "@/components/scroll-reveal";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { withBasePath } from "@/lib/base-path";
import { FACEBOOK_NAME, FACEBOOK_URL, PHONE_INTL_DISPLAY, whatsappLink } from "@/lib/contact";

const HERO_SLIDES = [
  {
    src: withBasePath("/images/work/hero-rug-cleaning.jpg"),
    alt: "An area rug freshly cleaned on Guardian's workshop floor, with extraction equipment behind it.",
  },
  {
    src: withBasePath("/images/work/pool-cover-cleaning.jpg"),
    alt: "A rotary cleaning machine scrubbing a large soapy pool cover on site.",
  },
  {
    src: withBasePath("/images/work/mattress-before-after.jpg"),
    alt: "A mattress split down the middle, one half still stained and one half cleaned bright white.",
  },
];

function CarIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2.5" y="13" width="19" height="5" rx="1.5" />
      <circle cx="7" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SERVICES = [
  { name: "Mattress Cleaning", image: withBasePath("/images/work/mattress-before-after.jpg") },
  { name: "Sofa & Couch Cleaning", image: withBasePath("/images/work/upholstery-after.jpg") },
  { name: "Carpet & Rug Cleaning", image: withBasePath("/images/work/rug-detail.jpg") },
  { name: "Car Interior Cleaning", image: null },
];

const SUPPORTING_WORK = [
  {
    src: withBasePath("/images/work/dining-chairs-clean.jpg"),
    alt: "A row of upholstered dining chairs drying outdoors after cleaning.",
    caption: "Dining chairs, cleaned",
  },
  {
    src: withBasePath("/images/work/pool-loungers-clean.jpg"),
    alt: "Two black-and-white striped pool lounger cushions, cleaned and set upright on a patio.",
    caption: "Outdoor cushions, cleaned",
  },
  {
    src: withBasePath("/images/work/pool-cover-result.jpg"),
    alt: "A large pool cover, cleaned and laid out beside the pool.",
    caption: "A pool cover, cleaned",
  },
];

const STEPS = [
  { number: "1", title: "Tell us what needs cleaning" },
  { number: "2", title: "Send a photo / request a quote" },
  { number: "3", title: "Cecil confirms the quote and a suitable time" },
];

const FAQS = [
  {
    q: "How do I request a quote?",
    a: "Fill in the quote request on this site or message us on WhatsApp with a description or photo of what needs cleaning.",
  },
  {
    q: "Can I send photos?",
    a: "Yes — photos help us give an accurate quote, especially for stains or heavy wear.",
  },
  {
    q: "Which areas do you service?",
    a: "Pretoria and surrounding areas.",
  },
  {
    q: "What types of items do you clean?",
    a: "Mattresses, sofas and couches, carpets and rugs, and car interiors.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero — text first, then a full-bleed photographic band */}
      <section className="pt-10 sm:pt-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--muted)] uppercase">
            Professional Cleaning — Pretoria
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl leading-tight font-bold text-[var(--foreground)] sm:text-5xl">
            Mattress, Upholstery, Carpet &amp; Car Cleaning
          </h1>
          <p className="mt-3 text-base font-medium text-[var(--guardian-deep)]">
            Clean Home. Fresh Life.
          </p>
          <p className="mt-4 max-w-md text-[var(--muted)]">
            Quoted from your photos and booked directly with Cecil — no call
            centre, no guesswork.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CtaButton href="/request-quote">Request a Quote</CtaButton>
            <CtaButton href={whatsappLink()} variant="secondary" external>
              WhatsApp Us
            </CtaButton>
          </div>
        </div>
      </section>

      <div className="mt-8 sm:mt-10">
        <HeroSlideshow slides={HERO_SLIDES} />
      </div>

      {/* Services — image-backed, scan by picture and heading */}
      <section className="border-t border-[var(--line)] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--guardian-deep)] uppercase">
              Our Services
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
              What we clean
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {SERVICES.map((service) => (
              <div
                key={service.name}
                className="group relative aspect-[16/10] overflow-hidden rounded-sm sm:aspect-[4/3]"
              >
                {service.image ? (
                  <>
                    <Image
                      src={service.image}
                      alt={service.name}
                      fill
                      sizes="(min-width: 640px) 45vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-4 text-lg font-semibold text-white sm:p-5 sm:text-xl">
                      {service.name}
                    </h3>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col justify-end bg-[var(--guardian-deep)] p-4 sm:p-5">
                    <CarIcon className="mb-2 h-6 w-6 text-white/85" />
                    <h3 className="text-lg font-semibold text-white sm:text-xl">
                      {service.name}
                    </h3>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Pricing depends on size, condition and location — request a free
            quote and we&apos;ll get back to you.
          </p>
        </div>
      </section>

      {/* Our Work */}
      <section className="border-t border-[var(--line)] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--guardian-deep)] uppercase">
              Our Work
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
              Real work. Real results.
            </h2>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
              No stock photography — drag to compare an actual Guardian job.
            </p>
          </ScrollReveal>

          <div className="mt-8 max-w-2xl">
            <BeforeAfterSlider
              beforeSrc={withBasePath("/images/work/upholstery-before.jpg")}
              afterSrc={withBasePath("/images/work/upholstery-after.jpg")}
              beforeAlt="Heavily soiled armchair cushion before cleaning, with cleaning products beside it."
              afterAlt="The same armchair after cleaning, upholstery visibly restored, cushion removed for drying."
            />
            <p className="mt-3 text-sm text-[var(--muted)]">
              Upholstery cleaning — same armchair, one visit.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-6">
            {SUPPORTING_WORK.map((photo) => (
              <figure key={photo.src}>
                <div className="relative aspect-[3/4] overflow-hidden rounded-sm">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 640px) 20vw, 30vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-2 text-xs text-[var(--muted)]">
                  {photo.caption}
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Follow-on from Our Work — deliberately a text link, not a
              button, so it never competes with Request a Quote / WhatsApp. */}
          <div className="mt-12 flex flex-col gap-4 border-t border-[var(--line)] pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div className="max-w-md">
              <h3 className="font-semibold text-[var(--foreground)]">
                See more of our work
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Follow Guardian Enviroclean on Facebook for recent cleaning
                jobs, before-and-after results and updates. Our Facebook page
                is {FACEBOOK_NAME}.
              </p>
            </div>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-[2px] py-1 text-sm font-medium text-[var(--guardian-deep)] transition-colors hover:text-[var(--guardian-deep-dark)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--guardian-deep)] sm:self-auto"
            >
              <span className="underline decoration-[var(--guardian-light)] underline-offset-4 group-hover:decoration-[var(--guardian-deep-dark)]">
                Follow on Facebook
              </span>
              <span aria-hidden="true">→</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="border-t border-[var(--line)] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--guardian-deep)] uppercase">
              How It Works
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
              Getting a quote
            </h2>
          </ScrollReveal>

          <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step) => (
              <li key={step.number} className="flex items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--guardian-deep)] text-sm font-semibold text-white">
                  {step.number}
                </span>
                <h3 className="pt-1.5 font-semibold text-[var(--foreground)]">
                  {step.title}
                </h3>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust — one plain, factual paragraph, no cards */}
      <section className="border-t border-[var(--line)] py-14 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <ScrollReveal>
            <p className="text-lg text-[var(--foreground)] sm:text-xl">
              Every photo on this site is real Guardian work — nothing
              staged, nothing stock. Guardian is Pretoria-based and
              personally run, most customers arrive through referrals, and
              quotes are based on your actual job or photos, not a generic
              price list.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Service area + contact, as practical info rather than a heading in whitespace */}
      <section className="border-t border-[var(--line)] py-10 sm:py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 border-y border-[var(--line)] px-4 py-8 sm:grid-cols-2 sm:px-6">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">
              Service Area
            </h3>
            <p className="mt-1 text-[var(--foreground)]">
              Pretoria and surrounding areas.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">
              Contact
            </h3>
            <p className="mt-1">
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--guardian-deep)] hover:underline"
              >
                WhatsApp {PHONE_INTL_DISPLAY}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[var(--line)] py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
              Frequently asked questions
            </h2>
          </ScrollReveal>

          <div className="mt-6 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-[var(--foreground)]">
                  {faq.q}
                  <span
                    aria-hidden
                    className="ml-4 shrink-0 text-xl text-[var(--muted)] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[var(--muted)]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-[var(--line)] bg-[var(--stone)]">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-16">
          <h2 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
            Ready for a fresher home?
          </h2>
          <div className="flex flex-wrap gap-3">
            <CtaButton href="/request-quote">Request a Quote</CtaButton>
            <CtaButton href={whatsappLink()} variant="secondary" external>
              WhatsApp Us
            </CtaButton>
          </div>
        </div>
      </section>
    </>
  );
}
