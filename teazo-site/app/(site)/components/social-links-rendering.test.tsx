/**
 * Component regression tests for TEAZO social media icons.
 *
 * Verify that the Admin Website Content editor and public
 * Contact page select icons from destination hostnames,
 * rather than internal IDs or display labels.
 *
 * Unsupported destinations use the custom
 * TEAZO share icon.
 *
 * Next.js image rendering is mocked. No network requests,
 * database writes, or production changes occur.
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
  render,
  screen,
  within,
} from "@testing-library/react";

import type { SocialLink } from "@/app/types/website-content";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      role="img"
      aria-label={alt || "Social icon"}
      data-src={src}
    />
  ),
}));

import SocialLinks from "./social-links";
import SocialSection from "../../admin/website-content/components/sections/social-section";

const facebookIcon =
  "/social_icons/social_svg/teazo_fb_icon.svg";

const instagramIcon =
  "/social_icons/social_svg/teazo_insta_icon.svg";

const yelpIcon =
  "/social_icons/social_svg/teazo_yelp_icon.svg";

const genericIcon =
  "/admin_icons/admin_svg/teazo_share_icon.svg";

// Shared fixtures contain only supported TEAZO platforms.
// Additional synthetic links are created within individual tests.
const links: SocialLink[] = [
  {
    id: "social-generated-instagram",
    label: "My Instagram",
    url: "instagram.com/teazosf",
    icon: "",
    enabled: true,
  },
  {
    id: "social-generated-yelp",
    label: "My Yelp",
    url: "https://www.yelp.com/biz/teazo-san-francisco",
    icon: "",
    enabled: true,
  },
];

function renderPublic(socialLinks = links) {
  return render(
    <SocialLinks
      links={socialLinks}
      businessName="TEAZO"
      email="teazosf@hotmail.com"
    />,
  );
}

function renderAdmin(socialLinks = links) {
  return render(
    <SocialSection
      socialLinks={socialLinks}
      isOpen={true}
      onToggle={vi.fn()}
      setRef={() => {}}
      onUpdateLink={vi.fn()}
      onAddLink={vi.fn()}
      onRemoveLink={vi.fn()}
    />,
  );
}

function publicIcon(label: string) {
  const link = screen.getByRole("link", {
    name: `TEAZO on ${label}`,
  });

  return within(link).getByRole("img");
}

function adminIcon(label: string) {
  const preview = document.querySelector(
    `[title="${label} icon"]`,
  );

  if (!preview) {
    throw new Error(`Missing Admin icon for ${label}`);
  }

  return preview.querySelector("[data-src]");
}

describe("Public Contact social icons", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("recognizes a newly created Facebook link by URL", () => {
    renderPublic([
      {
        id: "generated-facebook-id",
        label: "Facebook",
        url: "https://www.facebook.com/example",
        icon: "",
        enabled: true,
      },
    ]);

    expect(
      publicIcon("Facebook").getAttribute("data-src"),
    ).toBe(facebookIcon);
  });

  it("recognizes Instagram and Yelp by hostname", () => {
    renderPublic();

    expect(
      publicIcon("My Instagram").getAttribute("data-src"),
    ).toBe(instagramIcon);

    expect(
      publicIcon("My Yelp").getAttribute("data-src"),
    ).toBe(yelpIcon);
  });

  it("uses the TEAZO share SVG for an unsupported website", () => {
    renderPublic([
      {
        id: "custom-destination",
        label: "External Website",
        url: "https://example.org/",
        icon: "",
        enabled: true,
      },
    ]);

    expect(
      publicIcon("External Website")
        .getAttribute("data-src"),
    ).toBe(genericIcon);

    expect(
      publicIcon("External Website")
        .closest("a")?.getAttribute("href"),
    ).toBe("https://example.org/");
  });

  it("does not trust an old icon when the URL changes", () => {
    renderPublic([
      {
        id: "facebook",
        label: "Custom Destination",
        url: "https://example.org/",
        icon: facebookIcon,
        enabled: true,
      },
    ]);

    expect(
      publicIcon("Custom Destination")
        .getAttribute("data-src"),
    ).toBe(genericIcon);
  });

  it("omits disabled and unsafe destinations", () => {
    renderPublic([
      {
        id: "disabled",
        label: "Disabled",
        url: "https://facebook.com/example",
        icon: "",
        enabled: false,
      },
      {
        id: "unsafe",
        label: "Unsafe",
        url: "javascript:alert(1)",
        icon: "",
        enabled: true,
      },
    ]);

    expect(
      screen.queryByRole("link", {
        name: "TEAZO on Disabled",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("link", {
        name: "TEAZO on Unsafe",
      }),
    ).toBeNull();
  });
});

describe("Admin Website Content social icons", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("previews the Facebook icon for a generated ID", () => {
    renderAdmin([
      {
        id: "generated-facebook-id",
        label: "Facebook",
        url: "https://www.facebook.com/example",
        icon: "",
        enabled: true,
      },
    ]);

    expect(
      adminIcon("Facebook")?.getAttribute("data-src"),
    ).toBe(facebookIcon);
  });

  it("previews the supported platform icons", () => {
    renderAdmin();

    expect(
      adminIcon("My Instagram")?.getAttribute("data-src"),
    ).toBe(instagramIcon);

    expect(
      adminIcon("My Yelp")?.getAttribute("data-src"),
    ).toBe(yelpIcon);
  });

  it("uses the existing share icon for custom websites", () => {
    renderAdmin([
      {
        id: "custom-destination",
        label: "External Website",
        url: "https://example.org/",
        icon: "",
        enabled: true,
      },
    ]);

    expect(
      adminIcon("External Website")
        ?.getAttribute("data-src"),
    ).toBe(genericIcon);
  });

  it("updates the preview when the URL changes", () => {
    const initial: SocialLink[] = [
      {
        id: "new-social-link",
        label: "New Link",
        icon: "",
        url: "https://example.org/",
        enabled: true,
      },
    ];

    const { rerender } = renderAdmin(initial);

    expect(
      adminIcon("New Link")?.getAttribute("data-src"),
    ).toBe(genericIcon);

    rerender(
      <SocialSection
        socialLinks={[
          {
            ...initial[0],
            url: "https://www.facebook.com/example",
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

    expect(
      adminIcon("New Link")?.getAttribute("data-src"),
    ).toBe(facebookIcon);
  });
});
