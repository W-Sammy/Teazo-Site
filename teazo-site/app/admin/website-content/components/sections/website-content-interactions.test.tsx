/**
 * Tests the administrator-facing Website Content controls.
 *
 * Covers story editing, field validation feedback, contact
 * information, phone formatting, and feature toggles.
 *
 * These components receive mocked callbacks. No API,
 * database, or production website settings are modified.
 */

// @vitest-environment jsdom

import {
  afterEach,
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
} from "@testing-library/react";

import type {
  AddressInfo,
} from "@/app/types/website-content";

import StorySection from "./story-section";
import ContactSection from "./contact-section";
import OrderingSection from "./ordering-section";

const validAddress: AddressInfo = {
  businessName: "TEAZO",
  streetAddress: "1050 Taraval St",
  locality: "San Francisco, CA 94116",
  phone: "+1 (415) 748-7398",
  email: "teazo@example.invalid",
  mapQuery: "1050 Taraval St, San Francisco",
};

function renderStory(story = "Welcome to TEAZO") {
  const onStoryChange = vi.fn();
  const onBlur = vi.fn();

  const view = render(
    <StorySection
      story={story}
      isOpen={true}
      onToggle={vi.fn()}
      setRef={() => {}}
      onStoryChange={onStoryChange}
      onBlur={onBlur}
    />,
  );

  return {
    ...view,
    onStoryChange,
    onBlur,
  };
}

function renderContact(
  overrides: Partial<AddressInfo> = {},
  contactFormEnabled = true,
) {
  const onUpdateAddress = vi.fn();
  const onUpdateContactFormEnabled = vi.fn();
  const onBlur = vi.fn();

  const view = render(
    <ContactSection
      address={{ ...validAddress, ...overrides }}
      contactFormEnabled={contactFormEnabled}
      isOpen={true}
      onToggle={vi.fn()}
      setRef={() => {}}
      onUpdateAddress={onUpdateAddress}
      onUpdateContactFormEnabled={
        onUpdateContactFormEnabled
      }
      onBlur={onBlur}
    />,
  );

  return {
    ...view,
    onUpdateAddress,
    onUpdateContactFormEnabled,
    onBlur,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Website Content — Our Story administration", () => {
  it("displays the saved story and character count", () => {
    renderStory("Freshly prepared tea.");

    const textarea = screen.getByRole("textbox", {
      name: "Our Story",
    }) as HTMLTextAreaElement;

    expect(textarea.value).toBe("Freshly prepared tea.");

    expect(
      screen.getByText("21/2000"),
    ).toBeTruthy();
  });

  it("passes story edits to the administrator update callback", () => {
    const { onStoryChange, rerender } = renderStory();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Our Story",
      }),
      {
        target: {
          value: "Updated TEAZO story",
        },
      },
    );

    expect(onStoryChange).toHaveBeenCalledWith(
      "Updated TEAZO story",
    );

    rerender(
      <StorySection
        story="Updated TEAZO story"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onStoryChange={onStoryChange}
      />,
    );

    expect(
      screen.getByText("19/2000"),
    ).toBeTruthy();
  });

  it("shows an error for an empty story after blur", () => {
    renderStory("");

    const textarea = screen.getByRole("textbox", {
      name: "Our Story",
    });

    expect(
      screen.queryByText("Story can't be empty"),
    ).toBeNull();

    fireEvent.blur(textarea);

    expect(
      screen.getByText("Story can't be empty"),
    ).toBeTruthy();
  });

  it("shows a length error for stories over 2000 characters", () => {
    renderStory("A".repeat(2001));

    fireEvent.blur(
      screen.getByRole("textbox", {
        name: "Our Story",
      }),
    );

    expect(
      screen.getByText(
        "Keep it under 2000 characters",
      ),
    ).toBeTruthy();

    expect(
      screen.getByText("2001/2000"),
    ).toBeTruthy();
  });

  it("notifies the parent when the story field loses focus", () => {
    const { onBlur } = renderStory();

    fireEvent.blur(
      screen.getByRole("textbox", {
        name: "Our Story",
      }),
    );

    expect(onBlur).toHaveBeenCalledOnce();
  });
});

describe("Website Content — Contact Info administration", () => {
  it("passes street address changes to the update callback", () => {
    const { onUpdateAddress } = renderContact();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Street address (e.g. 1050 Taraval St.)",
      ),
      {
        target: {
          value: "123 Test Street",
        },
      },
    );

    expect(onUpdateAddress).toHaveBeenCalledWith({
      streetAddress: "123 Test Street",
    });
  });

  it("shows an error for an empty required address", () => {
    const { onBlur } = renderContact({
      streetAddress: "",
    });

    fireEvent.blur(
      screen.getByPlaceholderText(
        "Street address (e.g. 1050 Taraval St.)",
      ),
    );

    expect(
      screen.getByText("Street address is required"),
    ).toBeTruthy();

    expect(onBlur).toHaveBeenCalledWith(
      "Street address is required",
    );
  });

  it("rejects an invalid contact email after blur", () => {
    const { onBlur } = renderContact({
      email: "invalid-email",
    });

    fireEvent.blur(
      screen.getByPlaceholderText(
        "teazosf@hotmail.com",
      ),
    );

    const expected =
      "Enter a valid email address (e.g. teazosf@hotmail.com)";

    expect(
      screen.getByText(expected),
    ).toBeTruthy();

    expect(onBlur).toHaveBeenCalledWith(expected);
  });

  it("formats a valid phone number when the field loses focus", () => {
    const { onUpdateAddress, onBlur } = renderContact({
      phone: "4157487398",
    });

    fireEvent.blur(
      screen.getByPlaceholderText(
        "+1 (415) 748-7398",
      ),
    );

    expect(onUpdateAddress).toHaveBeenCalledWith({
      phone: "+1 (415) 748-7398",
    });

    expect(onBlur).toHaveBeenCalledWith();
  });

  it("shows an error for an overlong map search query", () => {
    const { onBlur } = renderContact({
      mapQuery: "A".repeat(301),
    });

    fireEvent.blur(
      screen.getByPlaceholderText(
        "Google Maps search query (optional, e.g. 1050 Taraval St, San Francisco, CA 94116)",
      ),
    );

    expect(
      screen.getByText("Keep under 300 characters"),
    ).toBeTruthy();

    expect(onBlur).toHaveBeenCalledWith(
      "Keep under 300 characters",
    );
  });

  it("passes contact-form toggle changes to the parent", () => {
    const { onUpdateContactFormEnabled, rerender } =
      renderContact();

    const toggle = screen.getByRole("switch", {
      name: "Toggle Contact Us form (currently enabled)",
    });

    expect(
      toggle.getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(toggle);

    expect(
      onUpdateContactFormEnabled,
    ).toHaveBeenCalledWith(false);

    rerender(
      <ContactSection
        address={validAddress}
        contactFormEnabled={false}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateAddress={vi.fn()}
        onUpdateContactFormEnabled={
          onUpdateContactFormEnabled
        }
      />,
    );

    expect(
      screen.getByRole("switch", {
        name: "Toggle Contact Us form (currently disabled)",
      }).getAttribute("aria-checked"),
    ).toBe("false");

    expect(
      screen.getByText("Disabled"),
    ).toBeTruthy();
  });
});

describe("Website Content — Online Ordering administration", () => {
  it("allows administrators to pause online pickup orders", () => {
    const onUpdate = vi.fn();

    render(
      <OrderingSection
        onlineOrderingEnabled={true}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateOnlineOrderingEnabled={onUpdate}
      />,
    );

    const toggle = screen.getByRole("switch", {
      name: "Online pickup orders (currently taking orders)",
    });

    expect(
      toggle.getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(toggle);

    expect(onUpdate).toHaveBeenCalledWith(false);
  });

  it("allows administrators to resume paused online orders", () => {
    const onUpdate = vi.fn();

    render(
      <OrderingSection
        onlineOrderingEnabled={false}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateOnlineOrderingEnabled={onUpdate}
      />,
    );

    expect(
      screen.getByText("Paused"),
    ).toBeTruthy();

    const toggle = screen.getByRole("switch", {
      name: "Online pickup orders (currently paused)",
    });

    expect(
      toggle.getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(toggle);

    expect(onUpdate).toHaveBeenCalledWith(true);
  });
});
