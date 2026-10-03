import type { NextConfig } from "next";

// Optional sub-path deployment, e.g. the AiForm Studio-linked copy served at
// aiformstudio.co.za/sites/guardian-enviroclean. Unset (the default) serves the
// site from the root as normal. Inlined at build time, so changing it needs a rebuild.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;
if (basePath && !/^(\/[a-z0-9-]+)+$/.test(basePath)) {
  throw new Error(`NEXT_PUBLIC_BASE_PATH must look like "/sites/name" (leading slash, no trailing slash); got "${basePath}"`);
}

const nextConfig: NextConfig = {
  basePath,
  // Always defined, so client code (e.g. the quote form's fetch) gets it inlined in every build.
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
  // A sub-path build is a temporary interim copy of the site: keep it (and its own
  // deployment URL) out of search results. The normal root deployment gets no header.
  async headers() {
    return basePath ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }] : [];
  },
};

export default nextConfig;
