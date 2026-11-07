/**
 * Tests the TEAZO administrator password setup and reset UI.
 *
 * Covers password dialog navigation, request submission,
 * input validation, token handling, API errors, successful
 * responses, duplicate submissions, and recovery options.
 *
 * API requests and Next.js navigation are mocked.
 * No real passwords are changed or emails sent.
 */

// Use jsdom to simulate browser elements and dialog interactions.
// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import PasswordFlow from "./password-flow";

// Store mocked navigation and network functions for inspection.
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  fetch: vi.fn(),
}));

// Read URL parameters from the simulated browser location.
// Prevent tests from performing actual Next.js navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () =>
    new URLSearchParams(window.location.search),
}));

// Prevent Google font loading during component tests.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({
    className: "test-font",
  }),
}));

// Save the native dialog methods before temporarily replacing them.
// jsdom does not fully implement showModal() and close().
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);

const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

// Implement only the dialog opening and closing behavior needed by tests.
beforeAll(() => {
  Object.defineProperty(
    HTMLDialogElement.prototype,
    "showModal",
    {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
  );

  Object.defineProperty(
    HTMLDialogElement.prototype,
    "close",
    {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  );
});

// Restore native dialog behavior after the test suite finishes.
afterAll(() => {
  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalShowModal,
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "showModal",
    );
  }

  if (originalClose) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "close",
      originalClose,
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "close",
    );
  }
});

// Build a lightweight API response without contacting the backend.
function apiResponse(
  ok: boolean,
  data: {
    message?: string;
    error?: string;
    code?: string;
  },
): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

// Retrieve the password dialog or fail with a descriptive error.
function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector("dialog");

  if (!dialog) {
    throw new Error("Password dialog not found.");
  }

  return dialog;
}

// Submit the password dialog form directly.
// This allows testing validation and request behavior.
function submitDialog() {
  const form = getDialog().querySelector("form");

  if (!form) {
    throw new Error("Password form not found.");
  }

  fireEvent.submit(form);
}

// Open the recovery dialog using its public interface button.
function openPasswordDialog() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }),
  );
}

// Populate both password fields for completion tests.
function enterPasswords(
  password: string,
  confirmation: string,
) {
  fireEvent.change(
    screen.getByLabelText("New password"),
    {
      target: { value: password },
    },
  );

  fireEvent.change(
    screen.getByLabelText("Confirm password"),
    {
      target: { value: confirmation },
    },
  );
}

// Set the simulated login URL before rendering PasswordFlow.
function setLoginUrl(query = "") {
  window.history.replaceState(
    {},
    "",
    `/login${query}`,
  );
}

// Parse the first intercepted fetch request for payload assertions.
function getRequestBody(): Record<string, unknown> {
  const options = mocks.fetch.mock.calls[0]?.[1] as
    | RequestInit
    | undefined;

  if (!options || typeof options.body !== "string") {
    throw new Error("Request body not found.");
  }

  return JSON.parse(options.body) as Record<
    string,
    unknown
  >;
}

describe("Admin password setup and reset interface", () => {
  // Reset navigation, network state, and URL before each test.
  beforeEach(() => {
    vi.clearAllMocks();

    setLoginUrl();

    mocks.fetch.mockResolvedValue(
      apiResponse(true, {
        message: "Request completed successfully.",
      }),
    );

    vi.stubGlobal("fetch", mocks.fetch);
  });

  // Remove rendered components and restore the original global fetch.
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe("Dialog rendering and navigation", () => {
    // Verify the initial page contains a recovery button and closed dialog.
    it("renders the password recovery button", () => {
      render(<PasswordFlow />);

      expect(
        screen.getByRole("button", {
          name: "SET OR RESET PASSWORD",
        }),
      ).toBeDefined();

      expect(getDialog().open).toBe(false);
    });

    // Opening the dialog should show the email request form.
    it("opens the password request dialog", () => {
      render(<PasswordFlow />);

      openPasswordDialog();

      expect(getDialog().open).toBe(true);

      expect(
        screen.getByText("Set or reset your password"),
      ).toBeDefined();

      expect(
        screen.getByRole("button", {
          name: "Send email link",
        }),
      ).toBeDefined();
    });

    // Prepopulate the recovery email from the login page when provided.
    it("uses the initial email when opening the dialog", () => {
      render(
        <PasswordFlow
          initialEmail="Admin@Example.com"
        />,
      );

      openPasswordDialog();

      const email = screen.getByLabelText(
        "Email",
      ) as HTMLInputElement;

      expect(email.value).toBe(
        "Admin@Example.com",
      );

      expect(email.required).toBe(true);
      expect(email.type).toBe("email");
      expect(email.maxLength).toBe(254);
    });

    // Prevent opening password recovery when the parent disables it.
    it("disables the recovery button when requested", () => {
      render(<PasswordFlow disabled />);

      const button = screen.getByRole(
        "button",
        {
          name: "SET OR RESET PASSWORD",
        },
      ) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      expect(getDialog().open).toBe(false);
    });

    // A reset URL without a token should start the link-request process.
    it("opens the request dialog from a reset URL without a token", () => {
      setLoginUrl("?passwordAction=reset");

      render(<PasswordFlow />);

      expect(getDialog().open).toBe(true);

      expect(
        screen.getByText("Set or reset your password"),
      ).toBeDefined();
    });

    // A setup URL containing a token should display password creation.
    it("opens password creation from a setup token URL", () => {
      const token = "A".repeat(43);

      setLoginUrl(
        `?passwordAction=setup&token=${token}`,
      );

      render(<PasswordFlow />);

      expect(getDialog().open).toBe(true);

      expect(
        screen.getByText("Create your password"),
      ).toBeDefined();

      expect(
        screen.getByRole("button", {
          name: "Save password",
        }),
      ).toBeDefined();
    });

    // A reset token should show password reset instead of account setup.
    it("opens password reset from a reset token URL", () => {
      const token = "B".repeat(43);

      setLoginUrl(
        `?passwordAction=reset&token=${token}`,
      );

      render(<PasswordFlow />);

      expect(getDialog().open).toBe(true);

      expect(
        screen.getByText("Reset your password"),
      ).toBeDefined();
    });

    // Ignore unsupported URL actions instead of opening an invalid flow.
    it("does not open automatically for an unsupported action", () => {
      setLoginUrl(
        `?passwordAction=unknown&token=${"C".repeat(43)}`,
      );

      render(<PasswordFlow />);

      expect(getDialog().open).toBe(false);
    });

    // Closing the dialog must remove sensitive password URL parameters.
    // Preserve unrelated parameters such as a navigation destination.
    it("closes the dialog and removes password parameters", () => {
      setLoginUrl(
        "?passwordAction=reset&next=%2Fadmin",
      );

      render(<PasswordFlow />);

      expect(getDialog().open).toBe(true);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Close password dialog",
        }),
      );

      expect(getDialog().open).toBe(false);

      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fadmin",
        { scroll: false },
      );
    });
  });

  describe("Password link requests", () => {
    // Normalize the email address and verify the password-request endpoint.
    it("normalizes email before submitting a password request", async () => {
      render(<PasswordFlow />);

      openPasswordDialog();

      fireEvent.change(
        screen.getByLabelText("Email"),
        {
          target: {
            value: "  ADMIN@EXAMPLE.COM  ",
          },
        },
      );

      submitDialog();

      await waitFor(() => {
        expect(mocks.fetch).toHaveBeenCalledOnce();
      });

      // The request must use JSON and avoid referrer or cached data.
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/admin/password/request",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
      );

      expect(getRequestBody()).toEqual({
        email: "admin@example.com",
      });
    });

    // Show a non-enumerating confirmation after a successful request.
    it("shows the success message after requesting a link", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(true, {
          message:
            "If this email is eligible, a password link will be sent shortly.",
        }),
      );

      render(<PasswordFlow />);

      openPasswordDialog();

      fireEvent.change(
        screen.getByLabelText("Email"),
        {
          target: {
            value: "admin@example.com",
          },
        },
      );

      submitDialog();

      const status = await screen.findByRole(
        "status",
      );

      expect(status.textContent).toBe(
        "If this email is eligible, a password link will be sent shortly.",
      );

      expect(
        screen.getByRole("button", {
          name: "Back to sign in",
        }),
      ).toBeDefined();
    });

    // Display rate limits or other API failures without closing the dialog.
    it("shows an API error when a request is rejected", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(false, {
          error: "Too many requests. Try again later.",
        }),
      );

      render(<PasswordFlow />);

      openPasswordDialog();

      fireEvent.change(
        screen.getByLabelText("Email"),
        {
          target: {
            value: "admin@example.com",
          },
        },
      );

      submitDialog();

      const alert = await screen.findByRole(
        "alert",
      );

      expect(alert.textContent).toBe(
        "Too many requests. Try again later.",
      );

      expect(getDialog().open).toBe(true);
    });

    // Catch network failures and avoid exposing internal error details.
    it("handles network failures without exposing internal details", async () => {
      mocks.fetch.mockRejectedValue(
        new Error("Internal connection failure"),
      );

      render(<PasswordFlow />);

      openPasswordDialog();

      fireEvent.change(
        screen.getByLabelText("Email"),
        {
          target: {
            value: "admin@example.com",
          },
        },
      );

      submitDialog();

      const alert = await screen.findByRole(
        "alert",
      );

      expect(alert.textContent).toBe(
        "Unable to complete the request. Check your connection and try again.",
      );

      expect(alert.textContent).not.toContain(
        "Internal connection failure",
      );
    });
  });

  describe("Password validation and completion", () => {
    // Use a valid-format reset URL for all completion validation tests.
    beforeEach(() => {
      setLoginUrl(
        `?passwordAction=reset&token=${"D".repeat(43)}`,
      );
    });

    // Reject passwords below the minimum supported length.
    it("rejects passwords shorter than six characters", () => {
      render(<PasswordFlow />);

      enterPasswords("short", "short");

      submitDialog();

      expect(screen.getByRole("alert").textContent).toBe(
        "Use a password between 6 and 128 characters.",
      );

      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    // Reject passwords exceeding the client-side maximum.
    it("rejects passwords longer than 128 characters", () => {
      render(<PasswordFlow />);

      const password = "A".repeat(129);

      enterPasswords(password, password);

      submitDialog();

      expect(screen.getByRole("alert").textContent).toBe(
        "Use a password between 6 and 128 characters.",
      );

      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    // Require matching password and confirmation values.
    it("rejects passwords that do not match", () => {
      render(<PasswordFlow />);

      enterPasswords(
        "Password123",
        "DifferentPassword123",
      );

      submitDialog();

      expect(screen.getByRole("alert").textContent).toBe(
        "Your passwords do not match.",
      );

      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    // Confirm that valid reset credentials reach the correct endpoint.
    it("submits a valid password and token", async () => {
      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      await waitFor(() => {
        expect(mocks.fetch).toHaveBeenCalledOnce();
      });

      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/admin/password/complete",
        expect.objectContaining({
          method: "POST",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
      );

      expect(getRequestBody()).toEqual({
        token: "D".repeat(43),
        purpose: "reset",
        password: "NewPassword123",
        confirmPassword: "NewPassword123",
      });
    });

    // Accept a password meeting the exact six-character minimum.
    it("accepts the minimum supported password length", async () => {
      render(<PasswordFlow />);

      enterPasswords("123456", "123456");

      submitDialog();

      await waitFor(() => {
        expect(mocks.fetch).toHaveBeenCalledOnce();
      });

      expect(getRequestBody()).toEqual(
        expect.objectContaining({
          password: "123456",
          confirmPassword: "123456",
        }),
      );
    });

    // Display the confirmation returned by a successful password update.
    it("displays confirmation after a successful password change", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(true, {
          message:
            "Your password has been saved. Sign in to continue.",
        }),
      );

      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      const status = await screen.findByRole(
        "status",
      );

      expect(status.textContent).toBe(
        "Your password has been saved. Sign in to continue.",
      );

      expect(
        screen.getByRole("button", {
          name: "Back to sign in",
        }),
      ).toBeDefined();
    });

    // Remove entered passwords even when the API rejects the update.
    it("clears password fields after a rejected request", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(false, {
          error: "Unable to save password.",
        }),
      );

      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toBe("Unable to save password.");

      expect(
        (
          screen.getByLabelText(
            "New password",
          ) as HTMLInputElement
        ).value,
      ).toBe("");

      expect(
        (
          screen.getByLabelText(
            "Confirm password",
          ) as HTMLInputElement
        ).value,
      ).toBe("");
    });

    // Offer a new password link after the server rejects an invalid token.
    it("shows recovery options for an invalid or expired token", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(false, {
          error: "Invalid or expired password link.",
          code: "INVALID_TOKEN",
        }),
      );

      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toBe("Invalid or expired password link.");

      expect(
        screen.getByRole("button", {
          name: "Request another link",
        }),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Request another link",
        }),
      );

      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?passwordAction=reset",
        { scroll: false },
      );
    });

    // Handle completion network failures without leaking server details.
    it("handles connection failures while saving a password", async () => {
      mocks.fetch.mockRejectedValue(
        new Error("Password service unavailable"),
      );

      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      const alert = await screen.findByRole(
        "alert",
      );

      expect(alert.textContent).toBe(
        "Unable to complete the request. Check your connection and try again.",
      );

      expect(alert.textContent).not.toContain(
        "Password service unavailable",
      );
    });
  });

  describe("Submission safety and recovery", () => {
    // Hold a network request open to verify duplicate-submission protection.
    it("prevents duplicate submissions while a request is pending", async () => {
      let resolveRequest:
        | ((response: Response) => void)
        | undefined;

      mocks.fetch.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      );

      render(<PasswordFlow />);

      openPasswordDialog();

      fireEvent.change(
        screen.getByLabelText("Email"),
        {
          target: {
            value: "admin@example.com",
          },
        },
      );

      submitDialog();

      const form = getDialog().querySelector("form");

      if (!form) {
        throw new Error("Password form not found.");
      }

      // The dialog must enter its busy state and disable interactions.
      expect(
        form.getAttribute("aria-busy"),
      ).toBe("true");

      const fieldset = form.querySelector("fieldset");

      expect(fieldset?.disabled).toBe(true);

      expect(
        (
          screen.getByRole("button", {
            name: "Close password dialog",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);

      // A second form submission must not issue another request.
      fireEvent.submit(form);

      expect(mocks.fetch).toHaveBeenCalledTimes(1);

      // Resolve the pending request and check the success state.
      await act(async () => {
        resolveRequest?.(
          apiResponse(true, {
            message: "Password link requested.",
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByRole("status").textContent,
        ).toBe("Password link requested.");
      });

      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    // Return to sign-in after completing a password setup workflow.
    it("returns to sign-in after successful completion", async () => {
      mocks.fetch.mockResolvedValue(
        apiResponse(true, {
          message:
            "Your password has been saved. Sign in to continue.",
        }),
      );

      setLoginUrl(
        `?passwordAction=setup&token=${"E".repeat(43)}`,
      );

      render(<PasswordFlow />);

      enterPasswords(
        "NewPassword123",
        "NewPassword123",
      );

      submitDialog();

      await screen.findByRole("status");

      fireEvent.click(
        screen.getByRole("button", {
          name: "Back to sign in",
        }),
      );

      expect(getDialog().open).toBe(false);

      expect(mocks.replace).toHaveBeenCalledWith(
        "/login",
        { scroll: false },
      );
    });

    // Preserve the setup purpose when creating an invited admin password.
    it("uses setup purpose for an invitation password link", async () => {
      const token = "F".repeat(43);

      setLoginUrl(
        `?passwordAction=setup&token=${token}`,
      );

      render(<PasswordFlow />);

      enterPasswords(
        "SetupPassword123",
        "SetupPassword123",
      );

      submitDialog();

      await waitFor(() => {
        expect(mocks.fetch).toHaveBeenCalledOnce();
      });

      expect(getRequestBody()).toEqual({
        token,
        purpose: "setup",
        password: "SetupPassword123",
        confirmPassword: "SetupPassword123",
      });
    });
  });
});
