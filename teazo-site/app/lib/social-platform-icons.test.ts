/**
 * Regression tests for supported social platform icons.
 *
 * Brand icons must be determined by the destination hostname,
 * not the link's internal ID or display name.
 */

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getSocialPlatformIcon,
} from "./social-platform-icons";

describe("Social platform icon recognition", () => {
  it.each([
    [
      "https://www.facebook.com/example",
      "/social_icons/social_svg/teazo_fb_icon.svg",
    ],
    [
      "facebook.com/people/TEAZO/100063111166083",
      "/social_icons/social_svg/teazo_fb_icon.svg",
    ],
    [
      "https://m.facebook.com/example",
      "/social_icons/social_svg/teazo_fb_icon.svg",
    ],
    [
      "https://www.instagram.com/teazosf/",
      "/social_icons/social_svg/teazo_insta_icon.svg",
    ],
    [
      "instagram.com/example",
      "/social_icons/social_svg/teazo_insta_icon.svg",
    ],
    [
      "https://www.yelp.com/biz/teazo-san-francisco",
      "/social_icons/social_svg/teazo_yelp_icon.svg",
    ],
  ])(
    "recognizes %s",
    (destination, expectedIcon) => {
      expect(
        getSocialPlatformIcon(destination),
      ).toBe(expectedIcon);
    },
  );

  it.each([
    "https://www.test.com/",
    "https://example.com/",
    "https://fakefacebook.com/",
    "https://facebook.com.example.com/",
    "https://notinstagram.com/",
    "https://yelp.com.evil.example/",
    "https://www.youtube.com/",
    "https://www.tiktok.com/",
    "mailto:hello@example.com",
    "https://facebook.com@evil.example/",
    "invalid destination",
    "",
  ])(
    "uses the generic fallback for %s",
    (destination) => {
      expect(
        getSocialPlatformIcon(destination),
      ).toBeNull();
    },
  );

  it("does not mistake URL path text for a platform", () => {
    expect(
      getSocialPlatformIcon(
        "https://example.com/facebook.com/profile",
      ),
    ).toBeNull();
  });

  it("does not mistake a query parameter for a platform", () => {
    expect(
      getSocialPlatformIcon(
        "https://example.com/?next=facebook.com",
      ),
    ).toBeNull();
  });

  it("does not require www for recognized platforms", () => {
    expect(
      getSocialPlatformIcon(
        "https://facebook.com/example",
      ),
    ).toBe(
      "/social_icons/social_svg/teazo_fb_icon.svg",
    );
  });

  it("does not fetch external website favicons", () => {
    expect(
      getSocialPlatformIcon(
        "https://www.test.com/",
      ),
    ).toBeNull();
  });
});
