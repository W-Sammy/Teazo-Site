/**
 * Tests D1 queries used by the public contact form.
 *
 * Coverage includes:
 * - Whether the contact form is enabled.
 * - Recent contact message counts for email throttling.
 * - Contact message persistence and optional field handling.
 * - Propagation of database errors.
 *
 * D1 is mocked, and SQL and bound values are inspected directly.
 * No real contact records are written.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prepare } from "@/app/lib/d1";

import {
  countRecentContactMessages,
  insertContactMessage,
  isContactFormEnabled,
  type NewContactMessage,
} from "./contact";

vi.mock("@/app/lib/d1", () => ({
  prepare: vi.fn(),
}));

const first = vi.fn();
const bind = vi.fn();
const run = vi.fn();

function message(
  overrides: Partial<NewContactMessage> = {},
): NewContactMessage {
  return {
    firstName: "Taylor",
    lastName: "Smith",
    email: "taylor@example.com",
    subject: "Catering question",
    message: "Do you offer catering?",
    ...overrides,
  };
}

describe("Contact form database queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate D1's prepared statement interface without
    // connecting to either local or production storage.
    bind.mockImplementation(() => ({ run }));

    vi.mocked(prepare).mockReturnValue({
      first,
      bind,
    } as never);

    run.mockResolvedValue({
      success: true,
      meta: { changes: 1 },
    });
  });

  // ============================================================
  // Contact form availability
  // ============================================================

  it("returns true when the contact form is enabled", async () => {
    first.mockResolvedValueOnce({
      contact_form_enabled: 1,
    });

    expect(await isContactFormEnabled()).toBe(true);
  });

  it("returns false when the contact form is disabled", async () => {
    first.mockResolvedValueOnce({
      contact_form_enabled: 0,
    });

    expect(await isContactFormEnabled()).toBe(false);
  });

  // A missing business profile does not disable the form.
  it("defaults to enabled when no business profile exists", async () => {
    first.mockResolvedValueOnce(null);

    expect(await isContactFormEnabled()).toBe(true);
  });

  it("queries the primary business profile", async () => {
    first.mockResolvedValueOnce({
      contact_form_enabled: 1,
    });

    await isContactFormEnabled();

    expect(prepare).toHaveBeenCalledWith(
      "SELECT contact_form_enabled FROM business_profile WHERE id = 1",
    );
  });

  it("propagates database errors when checking availability", async () => {
    first.mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    await expect(
      isContactFormEnabled(),
    ).rejects.toThrow("D1 unavailable");
  });

  // ============================================================
  // Recent message counts
  // ============================================================

  it("returns contact counts for the last hour and day", async () => {
    first.mockResolvedValueOnce({
      last_hour: 12,
      last_day: 45,
    });

    const result = await countRecentContactMessages();

    expect(result).toEqual({
      lastHour: 12,
      lastDay: 45,
    });
  });

  it("returns zero counts when D1 returns no row", async () => {
    first.mockResolvedValueOnce(null);

    const result = await countRecentContactMessages();

    expect(result).toEqual({
      lastHour: 0,
      lastDay: 0,
    });
  });

  // The SQL must measure one-hour and one-day windows.
  it("uses the expected rolling time windows", async () => {
    first.mockResolvedValueOnce({
      last_hour: 1,
      last_day: 1,
    });

    await countRecentContactMessages();

    const sql = String(
      vi.mocked(prepare).mock.calls[0][0],
    );

    expect(sql).toContain("FROM contact_message");
    expect(sql).toContain("'-1 hour'");
    expect(sql).toContain("'-1 day'");
  });

  it("propagates errors when message counts cannot be loaded", async () => {
    first.mockRejectedValueOnce(
      new Error("Counter query failed"),
    );

    await expect(
      countRecentContactMessages(),
    ).rejects.toThrow("Counter query failed");
  });

  // ============================================================
  // Contact message insertion
  // ============================================================

  it("inserts a complete contact message", async () => {
    await insertContactMessage(message());

    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining(
        "INSERT INTO contact_message",
      ),
    );

    expect(bind).toHaveBeenCalledWith(
      "Taylor",
      "Smith",
      "taylor@example.com",
      "Catering question",
      "Do you offer catering?",
    );

    expect(run).toHaveBeenCalledOnce();
  });

  // Blank optional fields are stored as SQL NULL.
  it("converts blank optional fields to null", async () => {
    await insertContactMessage(
      message({
        lastName: "",
        subject: "",
      }),
    );

    expect(bind).toHaveBeenCalledWith(
      "Taylor",
      null,
      "taylor@example.com",
      null,
      "Do you offer catering?",
    );
  });

  it("uses parameterized SQL for visitor-provided values", async () => {
    const unsafeValue = "'; DROP TABLE contact_message; --";

    await insertContactMessage(
      message({
        message: unsafeValue,
      }),
    );

    const sql = String(
      vi.mocked(prepare).mock.calls[0][0],
    );

    expect(sql).toContain(
      "VALUES (?1, ?2, ?3, ?4, ?5)",
    );

    expect(sql).not.toContain(unsafeValue);

    expect(bind).toHaveBeenCalledWith(
      "Taylor",
      "Smith",
      "taylor@example.com",
      "Catering question",
      unsafeValue,
    );
  });

  it("propagates database write errors", async () => {
    run.mockRejectedValueOnce(
      new Error("Insert failed"),
    );

    await expect(
      insertContactMessage(message()),
    ).rejects.toThrow("Insert failed");
  });
});
