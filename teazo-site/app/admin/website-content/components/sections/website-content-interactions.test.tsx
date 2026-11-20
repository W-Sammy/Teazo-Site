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
  waitFor,
} from "@testing-library/react";

import type {
  AddressInfo,
} from "@/app/types/website-content";

import StorySection from "./story-section";
import ContactSection from "./contact-section";
import OrderingSection from "./ordering-section";
import SocialSection from "./social-section";
import LogoSection from "./logo-section";

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

describe("SocialSection destination normalization & inline feedback (Phase 3)", () => {
  it("shows an inline preview hint when typing a domain-only destination", () => {
    const onUpdateLink = vi.fn();
    render(
      <SocialSection
        socialLinks={[{ id: "instagram", label: "Instagram", url: "instagram.com/teazosf", enabled: true, icon: "" }]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={onUpdateLink}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    expect(screen.getByText("Will save as:")).toBeTruthy();
    expect(screen.getByText("https://instagram.com/teazosf")).toBeTruthy();
  });

  it("shows an inline preview hint for bare email address", () => {
    render(
      <SocialSection
        socialLinks={[{ id: "email", label: "Email", url: "teazosf@hotmail.com", enabled: true, icon: "" }]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={vi.fn()}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    expect(screen.getByText("Will save as:")).toBeTruthy();
    expect(screen.getByText("mailto:teazosf@hotmail.com")).toBeTruthy();
  });

  it("auto-normalizes domain-only destinations to https on blur", () => {
    const onUpdateLink = vi.fn();
    render(
      <SocialSection
        socialLinks={[{ id: "instagram", label: "Instagram", url: "instagram.com/teazosf", enabled: true, icon: "" }]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={onUpdateLink}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Instagram link");
    fireEvent.blur(input);

    expect(onUpdateLink).toHaveBeenCalledWith("instagram", {
      url: "https://instagram.com/teazosf",
    });
  });

  it("auto-normalizes bare email to mailto on blur", () => {
    const onUpdateLink = vi.fn();
    render(
      <SocialSection
        socialLinks={[{ id: "email", label: "Email", url: "teazosf@hotmail.com", enabled: true, icon: "" }]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={onUpdateLink}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Email link");
    fireEvent.blur(input);

    expect(onUpdateLink).toHaveBeenCalledWith("email", {
      url: "mailto:teazosf@hotmail.com",
    });
  });

  it("displays immediate inline error for unsupported scheme after touch", () => {
    const onUpdateLink = vi.fn();
    render(
      <SocialSection
        socialLinks={[{ id: "xss", label: "XSS", url: "javascript:alert(1)", enabled: true, icon: "" }]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={onUpdateLink}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("XSS link");
    fireEvent.blur(input);

    expect(screen.getByText(/Unsupported scheme "javascript:"/)).toBeTruthy();
  });
});

describe("LogoSection media administration (Phase 4)", () => {
  function makeMockFile(name: string, type: string, size: number): File {
    const file = new File([], name, { type });
    Object.defineProperty(file, "size", { value: size });
    return file;
  }

  it("renders corrected favicon copy", () => {
    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Browser tab favicon is a static asset/),
    ).toBeTruthy();
  });

  it("shows validation error and does not upload when invalid file format is selected", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={vi.fn()}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.gif", "image/gif", 1024);

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText("Unsupported image format. Please upload PNG, JPG, or WebP."),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a file just over 4 MiB before uploading", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={vi.fn()}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("large.png", "image/png", 4 * 1024 * 1024 + 1);

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("Image file is too large. Must be 4 MiB or less.")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("displays upload progress and disables input during submission", async () => {
    let resolveUpload!: (value: Response) => void;
    const uploadPromise = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    vi.spyOn(global, "fetch").mockReturnValue(uploadPromise);

    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={vi.fn()}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.png", "image/png", 1024);

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getAllByText("Uploading...").length).toBeGreaterThan(0);
    expect(input.disabled).toBe(true);

    // Resolve upload
    resolveUpload(
      new Response(JSON.stringify({ success: true, url: "https://r2.teazo.com/logo/new.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => {
      expect(input.disabled).toBe(false);
    });
  });

  it("displays clear error message on server upload rejection without base64 fallback", async () => {
    const onLogoChange = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Image file is too large. Must be 4 MiB or less." }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={onLogoChange}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.png", "image/png", 1024);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Image file is too large. Must be 4 MiB or less.")).toBeTruthy();
    });

    expect(onLogoChange).not.toHaveBeenCalled();
    expect(input.disabled).toBe(false);
  });

  it("requires reconciliation after a lost response without base64 fallback or repeat upload", async () => {
    const onLogoChange = vi.fn();
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={onLogoChange}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.png", "image/png", 1024);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          "The logo save could not be confirmed. Reload this page to check the saved logo before uploading again.",
        ),
      ).toBeTruthy();
    });

    expect(onLogoChange).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Reload saved logo" })).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [503, { error: "The logo save could not be confirmed.", requiresReload: true }],
    [500, { error: "Upload processing failed." }],
    [200, { success: true }],
  ])("requires reload for an unconfirmed upload response (%s, %j)", async (status, body) => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json(body, { status }));
    const onLogoChange = vi.fn();
    render(<LogoSection logo="/TEAZO_logo.svg" isOpen onToggle={vi.fn()}
      setRef={() => {}} onLogoChange={onLogoChange} />);
    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.png", "image/png", 1024);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reload saved logo" })).toBeTruthy();
    });
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { files: [file] } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onLogoChange).not.toHaveBeenCalled();
  });

  it("allows retry after an explicitly rejected save", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({
      error: "Could not save the logo. Please try again.", requiresReload: false,
    }, { status: 503 }));
    render(<LogoSection logo="/TEAZO_logo.svg" isOpen onToggle={vi.fn()}
      setRef={() => {}} onLogoChange={vi.fn()} />);
    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeMockFile("logo.png", "image/png", 1024)] } });
    await waitFor(() => {
      expect(screen.getByText("Could not save the logo. Please try again.")).toBeTruthy();
      expect(input.disabled).toBe(false);
    });
    expect(screen.queryByRole("button", { name: "Reload saved logo" })).toBeNull();
  });

  it("successfully updates logo upon confirmed upload response", async () => {
    const onLogoChange = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, url: "https://r2.teazo.com/logo/confirmed.webp" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <LogoSection
        logo="/TEAZO_logo.svg"
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onLogoChange={onLogoChange}
      />,
    );

    const input = document.getElementById("website-logo-upload") as HTMLInputElement;
    const file = makeMockFile("logo.webp", "image/webp", 1024);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onLogoChange).toHaveBeenCalledWith("https://r2.teazo.com/logo/confirmed.webp");
    });
  });
});

describe("SocialSection icon artwork resolution (Phase 4)", () => {
  it("renders bundled brand icons and generic link fallback without dead upload controls", () => {
    const { container } = render(
      <SocialSection
        socialLinks={[
          {
            id: "facebook",
            label: "Facebook",
            url: "https://facebook.com/teazo",
            enabled: true,
            icon: "/social_icons/social_svg/teazo_fb_icon.svg",
          },
          {
            id: "threads",
            label: "Threads",
            url: "https://threads.net/@teazo",
            enabled: true,
            icon: "",
          },
        ]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateLink={vi.fn()}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />,
    );

    // Official brand icon rendered for Facebook
    const fbImg = container.querySelector('img[src="/social_icons/social_svg/teazo_fb_icon.svg"]');
    expect(fbImg).toBeTruthy();

    // Generic link icon rendered for custom platform
    const genericImg = container.querySelector('img[src="/admin_icons/admin_svg/teazo_share_icon.svg"]');
    expect(genericImg).toBeTruthy();

    // Verify dead file picker controls have been completely removed
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(0);

    // Verify explanatory UI copy is present
    expect(screen.getByText(/Custom icon uploads are not supported\./)).toBeTruthy();
  });
});
