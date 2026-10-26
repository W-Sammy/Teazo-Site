import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock authorization, database queries, and invitation delivery.
// This keeps tests isolated from real sessions, D1, and email services.
const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  listSettingsAdmins: vi.fn(),
  createSettingsAdmin: vi.fn(),
  sendAdminInvite: vi.fn(),
}));

// Replace the server authorization function with a controllable mock.
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

// Prevent tests from reading or modifying real administrator records.
vi.mock("@/app/lib/queries/settings", () => ({
  listSettingsAdmins: mocks.listSettingsAdmins,
  createSettingsAdmin: mocks.createSettingsAdmin,
}));

// Prevent real invitation emails or password setup tokens from being created.
vi.mock("@/app/lib/admin-invite", () => ({
  sendAdminInvite: mocks.sendAdminInvite,
}));

// Import the actual route handlers after registering their mocks.
import { GET, POST } from "./route";

// Represent an authenticated Owner with permission to manage administrators.
const owner = {
  id: "owner-id",
  username: "Test Owner",
  role_id: 1,
};

// Represent the Admin account returned after successful creation.
const newAdmin = {
  id: "new-admin-id",
  username: "Disposable Admin",
  email: "disposable@example.invalid",
  role: 2,
};

// Example database response containing an Owner and a regular Admin.
const administratorList = [
  {
    id: "owner-id",
    username: "Test Owner",
    email: "owner@example.invalid",
    role: 1,
  },
  {
    id: "admin-id",
    username: "Test Admin",
    email: "admin@example.invalid",
    role: 2,
  },
];

// Construct a GET request for the administrator management endpoint.
function makeGetRequest(): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins",
    { method: "GET" },
  );
}

// Construct a POST request with a JSON body and same-origin header.
function makePostRequest(body: unknown): Request {
  return new Request(
    "http://localhost:3000/api/admin/settings/admins",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

// Simulate a successful authorization check for the Owner.
function allowOwner() {
  mocks.requireAdminApi.mockResolvedValue({
    ok: true,
    admin: owner,
  });
}

// Simulate an authorization failure without invoking real authentication.
function deny(status: 401 | 403) {
  mocks.requireAdminApi.mockResolvedValue({
    ok: false,
    response: Response.json(
      { error: "Access denied." },
      { status },
    ),
  });
}

// Verify that only the Owner can retrieve the administrator list.
describe("Admin Settings GET authorization", () => {
  beforeEach(() => {
    // Reset mock call history and behavior before each test.
    vi.clearAllMocks();

    // Return a predictable administrator list unless overridden.
    mocks.listSettingsAdmins.mockResolvedValue(
      administratorList,
    );
  });

  it("allows Owner to view administrators", async () => {
    allowOwner();

    const response = await GET(makeGetRequest());

    // Role 1 is required to access administrator management.
    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      1,
    );

    expect(response.status).toBe(200);
    expect(mocks.listSettingsAdmins).toHaveBeenCalledOnce();

    // The response includes the list and the Owner's edit permission.
    expect(await response.json()).toEqual({
      admins: administratorList,
      canEdit: true,
    });
  });

  it("rejects unauthenticated requests with 401", async () => {
    deny(401);

    const response = await GET(makeGetRequest());

    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      1,
    );

    expect(response.status).toBe(401);

    // Unauthorized requests must not query administrator records.
    expect(mocks.listSettingsAdmins).not.toHaveBeenCalled();
  });

  it("rejects regular Admin requests with 403", async () => {
    deny(403);

    const response = await GET(makeGetRequest());

    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      1,
    );

    expect(response.status).toBe(403);

    // Role-2 Admins cannot retrieve the administrator management list.
    expect(mocks.listSettingsAdmins).not.toHaveBeenCalled();
  });

  it("returns 503 when listing administrators fails", async () => {
    allowOwner();

    // Simulate a database failure during the administrator lookup.
    mocks.listSettingsAdmins.mockRejectedValue(
      new Error("Database unavailable"),
    );

    // Suppress the expected error log for this failure scenario.
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await GET(makeGetRequest());

      expect(response.status).toBe(503);

      // Authorization must still occur before the database operation.
      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );
    } finally {
      // Restore normal console behavior after the test.
      consoleSpy.mockRestore();
    }
  });
});

// Verify account creation, Owner-only access, and invitation delivery.
describe("Admin Settings POST authorization and invitations", () => {
  beforeEach(() => {
    // Reset all mocks so previous test results cannot affect this test.
    vi.clearAllMocks();

    // Disable Brevo sandbox mode for predictable delivery assertions.
    vi.stubEnv("BREVO_SANDBOX", "0");

    // Simulate successfully saving a new role-2 administrator.
    mocks.createSettingsAdmin.mockResolvedValue(newAdmin);

    // Default to successful invitation submission.
    mocks.sendAdminInvite.mockResolvedValue("sent");
  });

  afterEach(() => {
    // Restore environment variables modified during these tests.
    vi.unstubAllEnvs();
  });

  it.each([401, 403] as const)(
    "rejects unauthorized creation with %i",
    async (status) => {
      deny(status);

      const response = await POST(
        makePostRequest({
          username: "Disposable Admin",
          email: "disposable@example.invalid",
        }),
      );

      // Creating accounts requires Owner authorization.
      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );

      expect(response.status).toBe(status);

      // Neither database creation nor invitation delivery may proceed.
      expect(mocks.createSettingsAdmin).not.toHaveBeenCalled();
      expect(mocks.sendAdminInvite).not.toHaveBeenCalled();
    },
  );

  it("allows Owner to create an Admin and submit an invitation", async () => {
    allowOwner();

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      1,
    );

    // Successful account creation returns HTTP 201.
    expect(response.status).toBe(201);

    // Only the validated username and email are passed to the query.
    expect(mocks.createSettingsAdmin).toHaveBeenCalledWith({
      username: "Disposable Admin",
      email: "disposable@example.invalid",
    });

    expect(mocks.createSettingsAdmin).toHaveBeenCalledOnce();

    // Invitation details are populated from the saved Admin account.
    expect(mocks.sendAdminInvite).toHaveBeenCalledWith({
      adminId: "new-admin-id",
      email: "disposable@example.invalid",
      username: "Disposable Admin",
      role: 2,
      invitedBy: "Test Owner",
    });

    expect(mocks.sendAdminInvite).toHaveBeenCalledOnce();

    // The API reports both the created account and delivery status.
    expect(await response.json()).toEqual({
      admin: newAdmin,
      invitation: {
        submitted: true,
        message:
          "Admin account created. Invitation submitted for delivery.",
      },
    });
  });

  it("ignores client-supplied elevated privileges", async () => {
    allowOwner();

    // Simulate an attempt to create an Owner or grant legacy privileges.
    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
        role: 1,
        canManageAdmins: true,
        can_invite_users: 1,
      }),
    );

    expect(response.status).toBe(201);

    // Elevated fields must not reach the account creation query.
    expect(mocks.createSettingsAdmin).toHaveBeenCalledWith({
      username: "Disposable Admin",
      email: "disposable@example.invalid",
    });

    expect(mocks.createSettingsAdmin).toHaveBeenCalledOnce();

    // The invitation must also use the actual role-2 database result.
    expect(mocks.sendAdminInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 2,
      }),
    );

    expect(await response.json()).toMatchObject({
      admin: {
        role: 2,
      },
      invitation: {
        submitted: true,
      },
    });
  });

  it("reports when the invitation is printed locally", async () => {
    allowOwner();

    // Simulate the email provider printing the invitation to the terminal.
    mocks.sendAdminInvite.mockResolvedValue("printed");

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(response.status).toBe(201);

    // Printed invitations must not be described as delivered emails.
    expect(await response.json()).toEqual({
      admin: newAdmin,
      invitation: {
        submitted: false,
        message:
          "Admin account created. The invitation was printed in the server terminal; no email was sent.",
      },
    });
  });

  it("reports when the invitation is captured in Mailpit", async () => {
    allowOwner();

    // Simulate local Mailpit capture rather than external delivery.
    mocks.sendAdminInvite.mockResolvedValue("captured");

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(response.status).toBe(201);

    expect(await response.json()).toEqual({
      admin: newAdmin,
      invitation: {
        submitted: false,
        message:
          "Admin account created. The invitation is available in the local Mailpit inbox.",
      },
    });
  });

  it("does not claim delivery when Brevo sandbox mode is enabled", async () => {
    allowOwner();

    // Brevo sandbox requests can succeed without delivering an email.
    vi.stubEnv("BREVO_SANDBOX", "1");

    mocks.sendAdminInvite.mockResolvedValue("sent");

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(response.status).toBe(201);

    // Report sandbox processing accurately instead of claiming delivery.
    expect(await response.json()).toEqual({
      admin: newAdmin,
      invitation: {
        submitted: false,
        message:
          "Admin account created. Brevo sandbox mode is enabled, so no email was delivered.",
      },
    });
  });

  it("preserves the created account when invitation delivery fails", async () => {
    allowOwner();

    // Simulate a delivery failure after successful account creation.
    mocks.sendAdminInvite.mockResolvedValue("failed");

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    // Account creation remains successful even when email delivery fails.
    expect(response.status).toBe(201);

    expect(mocks.createSettingsAdmin).toHaveBeenCalledOnce();
    expect(mocks.sendAdminInvite).toHaveBeenCalledOnce();

    // The response explains how the Owner can retry the invitation.
    expect(await response.json()).toEqual({
      admin: newAdmin,
      invitation: {
        submitted: false,
        message:
          "Admin account created, but the invitation could not be sent. Open this admin's three-dot menu and choose Resend Invitation to retry.",
      },
    });
  });

  it("preserves the created account when invitation generation is skipped", async () => {
    allowOwner();

    // A skipped invitation must not undo the database insertion.
    mocks.sendAdminInvite.mockResolvedValue("skipped");

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    expect(response.status).toBe(201);

    const body = await response.json();

    expect(body.admin).toEqual(newAdmin);
    expect(body.invitation.submitted).toBe(false);
    expect(body.invitation.message).toContain(
      "invitation could not be sent",
    );
  });

  it("preserves the created account if invitation sending throws", async () => {
    allowOwner();

    // Simulate an unexpected exception from the invitation service.
    mocks.sendAdminInvite.mockRejectedValue(
      new Error("Email service unavailable"),
    );

    const response = await POST(
      makePostRequest({
        username: "Disposable Admin",
        email: "disposable@example.invalid",
      }),
    );

    // The API must preserve successful account creation.
    expect(response.status).toBe(201);

    const body = await response.json();

    expect(body.admin).toEqual(newAdmin);
    expect(body.invitation.submitted).toBe(false);
    expect(body.invitation.message).toContain(
      "invitation could not be sent",
    );
  });

  it("returns 400 when administrator creation fails", async () => {
    allowOwner();

    // Simulate a database insertion failure such as a duplicate email.
    mocks.createSettingsAdmin.mockRejectedValue(
      new Error("Duplicate email address"),
    );

    // Suppress the expected server error log.
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await POST(
        makePostRequest({
          username: "Disposable Admin",
          email: "disposable@example.invalid",
        }),
      );

      expect(response.status).toBe(400);

      // An invitation must not be sent for an account that was not saved.
      expect(mocks.sendAdminInvite).not.toHaveBeenCalled();

      expect(await response.json()).toEqual({
        error:
          "The admin could not be added. The email may already exist.",
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("rejects malformed JSON before creating an administrator", async () => {
    allowOwner();

    // Construct an intentionally malformed JSON request.
    const request = new Request(
      "http://localhost:3000/api/admin/settings/admins",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: "{invalid-json",
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Invalid request body.",
    });

    // Invalid JSON must not trigger any account creation side effects.
    expect(mocks.createSettingsAdmin).not.toHaveBeenCalled();
    expect(mocks.sendAdminInvite).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { username: "", email: "test@example.invalid" },
    { username: "Test", email: "" },
    { username: 123, email: "test@example.invalid" },
    { username: "Test", email: 123 },
    null,
    [],
  ])("rejects invalid creation input: %j", async (body) => {
    allowOwner();

    // Reject missing fields, invalid types, null values, and arrays.
    const response = await POST(makePostRequest(body));

    expect(response.status).toBe(400);

    // Validation failures must not create accounts or send invitations.
    expect(mocks.createSettingsAdmin).not.toHaveBeenCalled();
    expect(mocks.sendAdminInvite).not.toHaveBeenCalled();
  });
});
