import "server-only";

import { db } from "./db";
import type { QuoteRequestData } from "./validation/quote-request";

// The only write path for a public quote request in Pass 1: one `jobs`
// row, status/source fixed to what a website enquiry always is. No
// job_photos row — photo upload lands in a later milestone (see
// docs/neon-foundation.md, "Quote Request Pipeline — Pass 1").
//
// quoted_amount / scheduled_at / amount_paid / job_costs / source_note /
// notes are intentionally omitted so they stay NULL. id / created_at /
// updated_at are intentionally omitted so the database defaults apply.
export async function insertWebsiteEnquiry(
  input: QuoteRequestData,
): Promise<{ id: string }> {
  const result = await db.query<{ id: string }>(
    `insert into jobs (customer_name, phone, service, area, description, status, source)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      input.customerName,
      input.phone,
      input.service,
      input.area,
      input.description,
      "NEW_ENQUIRY",
      "WEBSITE",
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("jobs insert did not return the new row's id.");
  }
  return { id: row.id };
}
