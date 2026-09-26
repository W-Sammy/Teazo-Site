// Server code only. Never import this file into a client component.
import { D1Error, prepare } from "@/app/lib/d1";

export type NewContactMessage = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
};

/** Whether the public contact form is shown. Throws if the database cannot be reached. */
export async function isContactFormEnabled(): Promise<boolean> {
  const row = await prepare(
    "SELECT contact_form_enabled FROM business_profile WHERE id = 1",
  ).first<{ contact_form_enabled: number }>();

  // No profile row means nobody has turned the form off.
  return row ? row.contact_form_enabled === 1 : true;
}

/** Call only after checking requireAdminApi(request, 2) or requireAdminPage(2). */
export async function setContactFormEnabled(enabled: boolean, adminId: string): Promise<void> {
  const result = await prepare(
    `UPDATE business_profile
        SET contact_form_enabled = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_by = ?2
      WHERE id = 1`,
  ).bind(enabled ? 1 : 0, adminId).run();

  if (result.meta.changes !== 1) {
    throw new D1Error("business_profile row 1 is missing, so the setting was not saved");
  }
}

/** How many messages arrived in the last hour and the last 24 hours, including any just saved. */
export async function countRecentContactMessages(): Promise<{ lastHour: number; lastDay: number }> {
  const row = await prepare(
    `SELECT count(*) AS last_day,
            coalesce(sum(created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')), 0) AS last_hour
       FROM contact_message
      WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`,
  ).first<{ last_day: number; last_hour: number }>();

  return { lastHour: row?.last_hour ?? 0, lastDay: row?.last_day ?? 0 };
}

/** Optional fields that were left blank are stored as NULL. */
export async function insertContactMessage(input: NewContactMessage): Promise<void> {
  await prepare(
    `INSERT INTO contact_message (first_name, last_name, email, subject, message)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(
    input.firstName || null,
    input.lastName || null,
    input.email || null,
    input.subject || null,
    input.message || null,
  ).run();
}
