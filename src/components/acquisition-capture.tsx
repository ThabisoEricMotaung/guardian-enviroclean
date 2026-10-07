"use client";

import { useEffect } from "react";
import { captureAcquisition } from "@/lib/acquisition";

// Records recognised Facebook attribution from the landing URL into
// sessionStorage (this tab only), so it survives browsing the site before
// the visitor opens Request a Quote. Renders nothing; no cookies, no
// third-party analytics. See src/lib/acquisition.ts.
export function AcquisitionCapture() {
  useEffect(() => {
    try {
      captureAcquisition(window.location.search, window.sessionStorage);
    } catch {
      // Accessing window.sessionStorage itself can throw when storage is blocked.
    }
  }, []);

  return null;
}
