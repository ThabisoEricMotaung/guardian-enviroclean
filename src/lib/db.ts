import "server-only";

import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Server-only Postgres pool for Neon. Uses the pooled connection string
// (DATABASE_URL) — appropriate for request-scoped queries from Next.js
// route handlers / server components, as opposed to DATABASE_URL_UNPOOLED
// (direct connection), which is for schema migrations, not app traffic.
//
// attachDatabasePool lets Vercel Fluid compute close idle connections
// between invocations instead of leaving them open against Neon.
function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const pool = new Pool({ connectionString });
  attachDatabasePool(pool);
  return pool;
}

export const db = createPool();
