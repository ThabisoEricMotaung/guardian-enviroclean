import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Manager Login | Guardian Enviroclean",
  robots: { index: false, follow: false },
};

// Cecil's private job-manager area — deliberately unstyled/unbranded like the
// customer site, since this is an internal tool, not a marketing surface.
// Authentication is not implemented yet; this is a route placeholder only.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">
          Job Manager
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Login is coming soon.
        </p>
      </div>
    </main>
  );
}
