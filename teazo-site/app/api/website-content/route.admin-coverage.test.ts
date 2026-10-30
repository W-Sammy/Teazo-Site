/**
 * Additional automated tests for the website-content API.
 *
 * Covers public content retrieval, administrator updates,
 * field validation, persistence, cache invalidation,
 * and failures.
 *
 * Database operations and external services are mocked.
 * No production records are accessed or modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getWebsiteContent: vi.fn(),
  updateWebsiteContent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: mocks.getWebsiteContent,
  updateWebsiteContent: mocks.updateWebsiteContent,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { GET, PATCH } from "./route";

function patchRequest(body: unknown): Request {
  return new Request(
    "http://localhost:3000/api/website-content",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    },
  );
}

async function submitPatch(body: unknown) {
  return PATCH(patchRequest(body));
}

const savedContent = {
  logo: "/TEAZO_logo.svg",
  story: "Welcome to TEAZO",
  address: {
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St",
    locality: "San Francisco, CA 94116",
    phone: "+1 (415) 748-7398",
    email: "test@example.invalid",
  },
  contactFormEnabled: true,
  onlineOrderingEnabled: true,
};

const holiday = (
  id: string,
  date: string,
) => ({
  id,
  name: "Holiday",
  date,
  closed: true,
});

describe("Website content administration and publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "test-admin",
        role_id: 2,
      },
    });

    mocks.getWebsiteContent.mockResolvedValue(
      savedContent,
    );

    mocks.updateWebsiteContent.mockImplementation(
      async (patch: unknown) => patch,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Public content retrieval", () => {
    it("returns saved public website content", async () => {
      const response = await GET();

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual(
        savedContent,
      );

      expect(
        mocks.getWebsiteContent,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.requireAdminApi,
      ).not.toHaveBeenCalled();
    });

    it("returns a service error when content cannot be loaded", async () => {
      mocks.getWebsiteContent.mockRejectedValueOnce(
        new Error("Database unavailable"),
      );

      const response = await GET();

      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "Failed to load website content",
      });
    });
  });

  describe("Story administration", () => {
    it("forwards valid story updates to persistence", async () => {
      const patch = {
        story: "Fresh tea prepared every day.",
      };

      const response = await submitPatch(patch);

      expect(response.status).toBe(200);

      expect(
        mocks.requireAdminApi,
      ).toHaveBeenCalledWith(
        expect.any(Request),
        2,
      );

      expect(
        mocks.updateWebsiteContent,
      ).toHaveBeenCalledExactlyOnceWith(patch);
    });

    it("rejects empty or whitespace-only stories", async () => {
      const response = await submitPatch({
        story: "   ",
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Story can't be empty",
        ),
      });

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });

    it("rejects stories exceeding 2000 characters", async () => {
      const response = await submitPatch({
        story: "A".repeat(2001),
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Keep it under 2000 characters",
        ),
      });

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Contact information administration", () => {
    it("accepts valid partial address updates", async () => {
      const patch = {
        address: {
          businessName: "TEAZO San Francisco",
          streetAddress: "1050 Taraval St",
        },
      };

      const response = await submitPatch(patch);

      expect(response.status).toBe(200);

      expect(
        mocks.updateWebsiteContent,
      ).toHaveBeenCalledExactlyOnceWith(patch);
    });

    it("rejects invalid telephone numbers", async () => {
      const response = await submitPatch({
        address: {
          phone: "invalid-phone",
        },
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Enter a valid phone number",
        ),
      });
    });

    it("rejects invalid contact email addresses", async () => {
      const response = await submitPatch({
        address: {
          email: "not-an-email",
        },
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Enter a valid email address",
        ),
      });

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });

    it("rejects overlong map search queries", async () => {
      const response = await submitPatch({
        address: {
          mapQuery: "A".repeat(301),
        },
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Social-link validation", () => {
    it("rejects enabled links with invalid destinations", async () => {
      const response = await submitPatch({
        socialLinks: [
          {
            id: "instagram",
            label: "Instagram",
            icon: "",
            url: "invalid-url",
            enabled: true,
          },
        ],
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Enter a valid link or email",
        ),
      });

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });

    it("rejects incomplete disabled links containing partial data", async () => {
      const response = await submitPatch({
        socialLinks: [
          {
            id: "incomplete",
            label: "Incomplete Link",
            icon: "",
            url: "",
            enabled: false,
          },
        ],
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Holiday validation", () => {
    it("rejects invalid holiday dates", async () => {
      const response = await submitPatch({
        holidays: [
          holiday("invalid", "2027-02-29"),
        ],
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });

    it("rejects duplicate holiday dates", async () => {
      const response = await submitPatch({
        holidays: [
          holiday("first", "12-25"),
          holiday("second", "12-25"),
        ],
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toMatchObject({
        error: expect.stringContaining(
          "Duplicate holiday date",
        ),
      });

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });

    it("allows yearly and one-time holidays on the same calendar date", async () => {
      const patch = {
        holidays: [
          holiday("annual", "12-25"),
          holiday("specific", "2026-12-25"),
        ],
      };

      const response = await submitPatch(patch);

      expect(response.status).toBe(200);

      expect(
        mocks.updateWebsiteContent,
      ).toHaveBeenCalledExactlyOnceWith(patch);
    });
  });

  describe("Contact-form configuration", () => {
    it("accepts a valid contact-form toggle", async () => {
      const patch = {
        contactFormEnabled: false,
      };

      const response = await submitPatch(patch);

      expect(response.status).toBe(200);

      expect(
        mocks.updateWebsiteContent,
      ).toHaveBeenCalledExactlyOnceWith(patch);
    });

    it("rejects non-Boolean contact-form settings", async () => {
      const response = await submitPatch({
        contactFormEnabled: "disabled",
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Persistence and cache invalidation", () => {
    it("does not invalidate public pages for invalid updates", async () => {
      const response = await submitPatch({
        story: "",
      });

      expect(response.status).toBe(400);

      expect(
        mocks.updateWebsiteContent,
      ).not.toHaveBeenCalled();

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });

    it("invalidates the required pages after a successful update", async () => {
      const response = await submitPatch({
        story: "Updated public story",
      });

      expect(response.status).toBe(200);

      // Read the first argument of each mock call.
      // Do not annotate each call as a single-element tuple.
      const invalidatedPaths =
        mocks.revalidatePath.mock.calls.map(
          (call) => call[0],
        );

      expect(invalidatedPaths).toEqual([
        "/",
        "/contact",
        "/delivery",
        "/menu",
        "/gallery",
        "/admin/website-content",
      ]);
    });

    it("returns an error without invalidating pages when persistence fails", async () => {
      vi.spyOn(console, "error").mockImplementation(
        () => {},
      );

      mocks.updateWebsiteContent.mockRejectedValueOnce(
        new Error("Database unavailable"),
      );

      const response = await submitPatch({
        story: "Valid website story",
      });

      expect(response.status).toBe(500);

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });
  });
});
