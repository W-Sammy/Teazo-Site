/**
 * Tests the TEAZO administrator login interface.
 *
 * Covers form rendering, input validation, credentials
 * submission, error feedback, duplicate submissions,
 * Google SSO, and safe post-login destinations.
 *
 * Authentication is mocked. No real sessions are created.
 */

// Run React component tests in a simulated browser environment.
// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import AdminLoginPage from "./login-client";

// Track authentication calls without contacting NextAuth.
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

// Replace the real sign-in implementation with a controllable mock.
vi.mock("next-auth/react", () => ({
  signIn: mocks.signIn,
}));

// Avoid loading Google fonts in the test environment.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-font" }),
  Cabin_Sketch: () => ({ className: "test-font" }),
}));

// Remove unrelated visual components from the login tests.
vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@/app/(site)/components/nav-bar-no-menu", () => ({
  default: () => null,
}));

vi.mock("@/app/components/bubble-field", () => ({
  BubbleField: () => null,
}));

// Password recovery has its own dedicated test file.
vi.mock("./password-flow", () => ({
  default: () => null,
}));

// Authentication URL messages are tested separately from the form.
vi.mock("./auth-message", () => ({
  default: () => null,
}));

// Render the login component with a simple footer.
function renderLogin() {
  return render(
    <AdminLoginPage footer={<footer>Test footer</footer>} />,
  );
}

// Populate both credential fields using React input events.
function enterCredentials(
  email = "admin@example.com",
  password = "TestPassword123",
) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });

  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

// Submit the form directly, including cases where the
// browser would normally prevent clicking a disabled button.
function submitLogin() {
  const button = screen.getByRole("button", {
    name: "SIGN IN",
  });

  const form = button.closest("form");

  if (!form) {
    throw new Error("Login form not found.");
  }

  fireEvent.submit(form);
}

describe("Admin login interface", () => {
  // Begin each test with a clean URL and invalid credentials response.
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockReset();

    window.history.replaceState({}, "", "/login");

    mocks.signIn.mockResolvedValue({
      error: "CredentialsSignin",
      ok: false,
    });
  });

  // Remove rendered components to prevent state leakage between tests.
  afterEach(() => {
    cleanup();
  });

  // Verify that required inputs and both authentication options render.
  it("renders the required login controls", () => {
    renderLogin();

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");

    expect(email.getAttribute("type")).toBe("email");
    expect(password.getAttribute("type")).toBe("password");

    expect(email.hasAttribute("required")).toBe(true);
    expect(password.hasAttribute("required")).toBe(true);

    expect(
      screen.getByRole("button", { name: "SIGN IN" }),
    ).toBeDefined();

    expect(
      screen.getByRole("button", {
        name: /continue with google/i,
      }),
    ).toBeDefined();
  });

  // Prevent credential submission until email and password are provided.
  it("disables sign-in until both fields contain values", () => {
    renderLogin();

    const button = screen.getByRole("button", {
      name: "SIGN IN",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });

    expect(button.disabled).toBe(false);
  });

  // Ensure empty form submissions never reach the authentication service.
  it("rejects empty credentials without calling signIn", () => {
    renderLogin();

    submitLogin();

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter your email and password.",
    );

    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  // Normalize the email while preserving the supplied password.
  // Let the component manage navigation after authentication.
  it("normalizes email and submits credentials without automatic redirect", async () => {
    renderLogin();

    enterCredentials(
      "ADMIN@EXAMPLE.COM",
      "TestPassword123",
    );

    submitLogin();

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith(
        "credentials",
        {
          email: "admin@example.com",
          password: "TestPassword123",
          redirect: false,
          redirectTo: "/admin",
        },
      );
    });
  });

  // Show a generic failure message without exposing account details.
  // Clear the entered password after authentication fails.
  it("shows a generic error for invalid credentials", async () => {
    renderLogin();

    enterCredentials();
    submitLogin();

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("Invalid email or password.");

    expect(
      (screen.getByLabelText("Password") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  // Distinguish authentication service failures from invalid passwords.
  it("shows a service error for other authentication failures", async () => {
    mocks.signIn.mockResolvedValue({
      error: "ServiceUnavailable",
      ok: false,
    });

    renderLogin();
    enterCredentials();
    submitLogin();

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe(
      "Sign-in is temporarily unavailable. Please try again.",
    );
  });

  // Handle unsuccessful responses even when no specific error is returned.
  it("handles a non-success result without an error code", async () => {
    mocks.signIn.mockResolvedValue({
      error: null,
      ok: false,
    });

    renderLogin();
    enterCredentials();
    submitLogin();

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe(
      "Sign-in could not be completed. Please try again.",
    );
  });

  // Present a safe message when authentication throws a network error.
  it("handles network failures without exposing details", async () => {
    mocks.signIn.mockRejectedValue(
      new Error("Internal network failure"),
    );

    renderLogin();
    enterCredentials();
    submitLogin();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toBe(
      "Unable to connect. Please try again.",
    );

    expect(alert.textContent).not.toContain(
      "Internal network failure",
    );
  });

  // Hold the first request open to simulate a slow authentication service.
  // Verify that the form cannot submit a duplicate request.
  it("prevents another submission while sign-in is pending", async () => {
    let resolveSignIn:
      | ((result: { error: string; ok: boolean }) => void)
      | undefined;

    mocks.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );

    renderLogin();
    enterCredentials();
    submitLogin();

    const pendingButton = screen.getByRole("button", {
      name: /signing in/i,
    }) as HTMLButtonElement;

    const form = pendingButton.closest("form");

    if (!form) {
      throw new Error("Login form not found.");
    }

    // Inputs and submission controls must be disabled during the request.
    expect(pendingButton.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");

    expect(
      (screen.getByLabelText("Email") as HTMLInputElement)
        .disabled,
    ).toBe(true);

    expect(
      (screen.getByLabelText("Password") as HTMLInputElement)
        .disabled,
    ).toBe(true);

    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    // Programmatically submit again to verify duplicate protection.
    fireEvent.submit(form);

    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    // Complete the original authentication request with a failure.
    resolveSignIn?.({
      error: "CredentialsSignin",
      ok: false,
    });

    // Confirm that the component exits its submitting state.
    await waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBe("false");

      expect(
        screen.getByRole("button", { name: "SIGN IN" }),
      ).toBeDefined();
    });

    const passwordInput = screen.getByLabelText(
      "Password",
    ) as HTMLInputElement;

    const signInButton = screen.getByRole("button", {
      name: "SIGN IN",
    }) as HTMLButtonElement;

    // A failed request clears the password and keeps Sign In disabled.
    expect(passwordInput.value).toBe("");
    expect(passwordInput.disabled).toBe(false);
    expect(signInButton.disabled).toBe(true);

    // Re-entering the password allows another attempt.
    fireEvent.change(passwordInput, {
      target: { value: "RetryPassword123" },
    });

    expect(signInButton.disabled).toBe(false);

    // No additional authentication request has been submitted.
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  // Use the administrator dashboard when no alternate destination exists.
  it("defaults to the admin dashboard after sign-in", async () => {
    renderLogin();
    enterCredentials();
    submitLogin();

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({
          redirectTo: "/admin",
        }),
      );
    });
  });

  // Permit a correctly formatted ownership-transfer review destination.
  it("allows a valid ownership-transfer destination", async () => {
    const token = "A".repeat(43);

    const destination =
      `/ownership-transfer?token=${token}`;

    window.history.replaceState(
      {},
      "",
      `/login?next=${encodeURIComponent(destination)}`,
    );

    renderLogin();
    enterCredentials();
    submitLogin();

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({
          redirectTo: destination,
        }),
      );
    });
  });

  // Reject external redirects, unsupported paths, and malformed tokens.
  // Every rejected destination must fall back to /admin.
  it.each([
    "https://example.com",
    "//example.com",
    "/admin?unexpected=true",
    "/ownership-transfer?token=invalid",
    `/ownership-transfer?token=${"A".repeat(43)}&other=1`,
  ])(
    "rejects an unauthorized post-login destination: %s",
    async (destination) => {
      window.history.replaceState(
        {},
        "",
        `/login?next=${encodeURIComponent(destination)}`,
      );

      renderLogin();
      enterCredentials();
      submitLogin();

      await waitFor(() => {
        expect(mocks.signIn).toHaveBeenCalledWith(
          "credentials",
          expect.objectContaining({
            redirectTo: "/admin",
          }),
        );
      });
    },
  );

  // Verify that Google authentication uses the expected default redirect.
  it("starts Google SSO with the admin destination", () => {
    renderLogin();

    fireEvent.click(
      screen.getByRole("button", {
        name: /continue with google/i,
      }),
    );

    expect(mocks.signIn).toHaveBeenCalledWith(
      "google",
      {
        redirectTo: "/admin",
      },
    );
  });

  // Preserve valid ownership-transfer links for Google authentication.
  it("preserves valid ownership-transfer links for Google SSO", () => {
    const destination =
      `/ownership-transfer?token=${"B".repeat(43)}`;

    window.history.replaceState(
      {},
      "",
      `/login?next=${encodeURIComponent(destination)}`,
    );

    renderLogin();

    fireEvent.click(
      screen.getByRole("button", {
        name: /continue with google/i,
      }),
    );

    expect(mocks.signIn).toHaveBeenCalledWith(
      "google",
      {
        redirectTo: destination,
      },
    );
  });
});
