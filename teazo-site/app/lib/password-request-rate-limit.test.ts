import { beforeEach, describe, expect, it, vi } from "vitest";

import { prepare } from "./d1";
import { rateLimitKey } from "./queries/rate-limit";
import {
  consumePasswordRequestLimit,
  PASSWORD_EMAIL_LIMIT,
  PASSWORD_IP_LIMIT,
} from "./password-request-rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("./d1", () => ({ prepare: vi.fn() }));
vi.mock("./queries/rate-limit", () => ({
  rateLimitKey: vi.fn(
    (rule: { name: string }, identifier?: string) =>
      `${rule.name}:${identifier ?? "unknown"}`,
  ),
}));

const first = vi.fn();
const bind = vi.fn();

describe("Password request rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    bind.mockImplementation(() => ({ first }));

    vi.mocked(prepare).mockReturnValue({
      bind,
    } as never);
  });

  it("allows the first email request", async () => {
    first.mockResolvedValueOnce({ event_count: 1 });

    const result = await consumePasswordRequestLimit(
      PASSWORD_EMAIL_LIMIT,
      "admin@example.com",
    );

    expect(result).toBe(true);
  });

  it("allows the third email request", async () => {
    first.mockResolvedValueOnce({ event_count: 3 });

    const result = await consumePasswordRequestLimit(
      PASSWORD_EMAIL_LIMIT,
      "admin@example.com",
    );

    expect(result).toBe(true);
  });

  it("rejects the fourth email request", async () => {
    first.mockResolvedValueOnce({ event_count: 4 });

    const result = await consumePasswordRequestLimit(
      PASSWORD_EMAIL_LIMIT,
      "admin@example.com",
    );

    expect(result).toBe(false);
  });

  it("enforces the IP request limit", async () => {
    first.mockResolvedValueOnce({ event_count: 11 });

    const result = await consumePasswordRequestLimit(
      PASSWORD_IP_LIMIT,
      "192.0.2.1",
    );

    expect(result).toBe(false);
  });

  it("uses the namespaced rate-limit key", async () => {
    first.mockResolvedValueOnce({ event_count: 1 });

    await consumePasswordRequestLimit(
      PASSWORD_EMAIL_LIMIT,
      "admin@example.com",
    );

    expect(rateLimitKey).toHaveBeenCalledWith(
      PASSWORD_EMAIL_LIMIT,
      "admin@example.com",
    );
  });

  it("uses an atomic INSERT/UPDATE counter", async () => {
    first.mockResolvedValueOnce({ event_count: 1 });

    await consumePasswordRequestLimit(
      PASSWORD_IP_LIMIT,
      "192.0.2.1",
    );

    const sql = String(vi.mocked(prepare).mock.calls[0][0]);

    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("event_count + 1");
    expect(sql).toContain("RETURNING event_count");
  });

  it("fails closed when D1 returns no counter", async () => {
    first.mockResolvedValueOnce(null);

    await expect(
      consumePasswordRequestLimit(
        PASSWORD_EMAIL_LIMIT,
        "admin@example.com",
      ),
    ).rejects.toThrow(
      "Password request limit could not be checked.",
    );
  });

  it("propagates database errors", async () => {
    first.mockRejectedValueOnce(new Error("D1 unavailable"));

    await expect(
      consumePasswordRequestLimit(
        PASSWORD_EMAIL_LIMIT,
        "admin@example.com",
      ),
    ).rejects.toThrow("D1 unavailable");
  });
});
