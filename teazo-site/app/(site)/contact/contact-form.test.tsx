/**
 * Tests the public TEAZO Contact Form React component.
 *
 * Covers required fields, field limits, honeypot protection,
 * success/error feedback, submitted values, manual retries,
 * pending submissions, and Turnstile error recovery.
 *
 * The server action and Turnstile widget are mocked.
 * No real customer messages or emails are sent.
 */

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
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import ContactForm from "./contact-form";

// Keep the mock accessible to individual tests.
const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}));

// Prevent contact submissions from reaching the database
// or scheduling notification emails.
vi.mock("./actions", () => ({
  submitContactMessage: mocks.submit,
}));

// Replace Cloudflare Turnstile with a controlled component.
//
// The fake widget provides a token field and buttons that
// simulate security-check failure and recovery.
vi.mock("@/app/components/turnstile-widget", () => ({
  TURNSTILE_SITE_KEY: "test-site-key",

  default: ({
    onFailedChange,
  }: {
    onFailedChange?: (failed: boolean) => void;
  }) => (
    <div data-testid="mock-turnstile">
      <input
        type="hidden"
        name="cf-turnstile-response"
        value="mock-turnstile-token"
        readOnly
      />

      <button
        type="button"
        onClick={() => onFailedChange?.(true)}
      >
        Simulate security failure
      </button>

      <button
        type="button"
        onClick={() => onFailedChange?.(false)}
      >
        Simulate security recovery
      </button>
    </div>
  ),
}));

// Use a non-deliverable email domain in tests.
const FALLBACK_EMAIL = "contact@example.invalid";

// Render the actual form while keeping its dependencies mocked.
function renderForm() {
  return render(
    <ContactForm fallbackEmail={FALLBACK_EMAIL} />,
  );
}

// Locate the form using its submit button.
function getForm(): HTMLFormElement {
  const form = screen
    .getByRole("button", { name: "SUBMIT" })
    .closest("form");

  if (!form) {
    throw new Error("Contact form not found.");
  }

  return form;
}

// Fill the required fields for a valid browser submission.
function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("First name"), {
    target: { value: "Test" },
  });

  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "visitor@example.invalid" },
  });

  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "A test contact message." },
  });
}

// Submit the form and flush completed React action updates.
async function submitForm() {
  await act(async () => {
    fireEvent.submit(getForm());
  });
}

describe("Public Contact Form interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Use a successful result unless an individual test
    // specifically overrides the mocked server action.
    mocks.submit.mockResolvedValue({
      status: "sent",
    });
  });

  afterEach(() => {
    cleanup();
  });

  // Confirm the required controls and accessible labels.
  it("renders all contact form fields", () => {
    renderForm();

    expect(screen.getByLabelText("First name")).toBeDefined();
    expect(screen.getByLabelText("Last name")).toBeDefined();
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Subject")).toBeDefined();
    expect(screen.getByLabelText("Message")).toBeDefined();

    expect(
      screen.getByRole("button", { name: "SUBMIT" }),
    ).toBeDefined();
  });

  // The first name, email, and message are mandatory.
  // Last name and subject remain optional.
  it("marks only the expected fields as required", () => {
    renderForm();

    for (const name of ["First name", "Email", "Message"]) {
      expect(
        (
          screen.getByLabelText(name) as HTMLInputElement
        ).required,
      ).toBe(true);
    }

    for (const name of ["Last name", "Subject"]) {
      expect(
        (
          screen.getByLabelText(name) as HTMLInputElement
        ).required,
      ).toBe(false);
    }
  });

  // Verify client-side limits match the existing form.
  it("sets maximum lengths for contact fields", () => {
    renderForm();

    const expected = [
      ["First name", 100],
      ["Last name", 100],
      ["Email", 254],
      ["Subject", 200],
      ["Message", 5000],
    ] as const;

    for (const [name, maxLength] of expected) {
      const field = screen.getByLabelText(
        name,
      ) as HTMLInputElement | HTMLTextAreaElement;

      expect(field.maxLength).toBe(maxLength);
    }
  });

  // Ensure the invisible company field used for bot detection
  // remains present in submitted form data.
  it("includes the hidden honeypot field", () => {
    renderForm();

    const honeypot = getForm().querySelector(
      'input[name="company"]',
    ) as HTMLInputElement | null;

    expect(honeypot).not.toBeNull();
    expect(honeypot?.tabIndex).toBe(-1);
    expect(honeypot?.autocomplete).toBe("off");
  });

  // Confirm that the Turnstile component is included.
  it("renders the security-check widget", () => {
    renderForm();

    expect(
      screen.getByTestId("mock-turnstile"),
    ).toBeDefined();
  });

  // Verify that the server action receives the visitor's
  // entered values and the security-check token.
  it("submits the entered contact information", async () => {
    renderForm();

    fillRequiredFields();

    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Visitor" },
    });

    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Question" },
    });

    await submitForm();

    expect(mocks.submit).toHaveBeenCalledOnce();

    const formData = mocks.submit.mock.calls[0][1] as FormData;

    expect(formData.get("firstName")).toBe("Test");
    expect(formData.get("lastName")).toBe("Visitor");
    expect(formData.get("email")).toBe(
      "visitor@example.invalid",
    );
    expect(formData.get("subject")).toBe("Question");
    expect(formData.get("message")).toBe(
      "A test contact message.",
    );
    expect(formData.get("cf-turnstile-response")).toBe(
      "mock-turnstile-token",
    );
  });

  // Display success feedback after the mocked action completes.
  it("shows confirmation after successful submission", async () => {
    renderForm();
    fillRequiredFields();

    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByRole("status").textContent,
      ).toContain(
        "Thank you. Your message was sent",
      );
    });
  });

  // Keep the returned error visible and provide an alternate
  // contact method if the server rejects the submission.
  it("shows submission errors with a fallback email", async () => {
    mocks.submit.mockResolvedValue({
      status: "error",
      message: "Your message could not be sent right now.",
      values: {
        firstName: "Test",
        lastName: "",
        email: "visitor@example.invalid",
        subject: "",
        message: "A test contact message.",
      },
    });

    renderForm();
    fillRequiredFields();

    await submitForm();

    const status = screen.getByRole("status");

    await waitFor(() => {
      expect(status.textContent).toContain(
        "Your message could not be sent right now.",
      );
    });

    expect(
      status.querySelector("a")?.getAttribute("href"),
    ).toBe(`mailto:${FALLBACK_EMAIL}`);
  });

  // A rejected server action returns entered values.
  // Confirm those values are restored for editing.
  it("restores entered fields after a submission error", async () => {
    mocks.submit.mockResolvedValue({
      status: "error",
      message: "Please try again.",
      values: {
        firstName: "Test",
        lastName: "Visitor",
        email: "visitor@example.invalid",
        subject: "Question",
        message: "Please contact me.",
      },
    });

    renderForm();

    fillRequiredFields();

    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByLabelText("First name"),
      ).toHaveProperty("value", "Test");
    });

    expect(
      screen.getByLabelText("Email"),
    ).toHaveProperty(
      "value",
      "visitor@example.invalid",
    );
  });

  // Verify that the UI supports a manual retry after an
  // unsuccessful submission rather than claiming automatic retry.
  it("allows another attempt after an error", async () => {
    mocks.submit
      .mockResolvedValueOnce({
        status: "error",
        message: "Please try again.",
        values: {
          firstName: "Test",
          lastName: "",
          email: "visitor@example.invalid",
          subject: "",
          message: "A test contact message.",
        },
      })
      .mockResolvedValueOnce({
        status: "sent",
      });

    renderForm();

    fillRequiredFields();
    await submitForm();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "Please try again.",
      );
    });

    // Submit again using the restored form fields.
    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByRole("status").textContent,
      ).toContain("Thank you.");
    });

    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  // When Turnstile reports a failure, visitors should be
  // informed that the check did not complete.
  it("displays security-check failure feedback", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Simulate security failure",
      }),
    );

    expect(document.body.textContent).toContain(
      "The security check couldn't load",
    );
  });

  // Provide a working mailto fallback during bot-check failure.
  it("provides the fallback email when Turnstile fails", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Simulate security failure",
      }),
    );

    const link = screen.getByRole("link", {
      name: FALLBACK_EMAIL,
    });

    expect(link.getAttribute("href")).toBe(
      `mailto:${FALLBACK_EMAIL}`,
    );
  });

  // Verify that Turnstile recovery clears the warning.
  it("removes the security warning after recovery", () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Simulate security failure",
      }),
    );

    expect(document.body.textContent).toContain(
      "The security check couldn't load",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Simulate security recovery",
      }),
    );

    expect(document.body.textContent).not.toContain(
      "The security check couldn't load",
    );
  });
});
