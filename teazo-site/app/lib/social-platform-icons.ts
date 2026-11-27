/**
 * Resolve supported social platform icons from a link's URL.
 *
 * Use the hostname, never a link's internal ID or display label.
 * Accept the exact supported domain and its subdomains, but do
 * not match lookalike domains such as fakefacebook.com or
 * facebook.com.example.com.
 *
 * Unsupported websites and email destinations return null,
 * allowing the UI to display its generic link icon.
 */

import { parseAndNormalizeDestination } from
  "@/app/lib/website-content-validators";

const SOCIAL_PLATFORMS = [
  {
    hostname: "facebook.com",
    icon: "/social_icons/social_svg/teazo_fb_icon.svg",
  },
  {
    hostname: "instagram.com",
    icon: "/social_icons/social_svg/teazo_insta_icon.svg",
  },
  {
    hostname: "yelp.com",
    icon: "/social_icons/social_svg/teazo_yelp_icon.svg",
  },
] as const;

export function getSocialPlatformIcon(
  destination: string,
): string | null {
  const parsed = parseAndNormalizeDestination(destination);

  if (!parsed.ok || parsed.kind !== "url") {
    return null;
  }

  let hostname: string;

  try {
    hostname = new URL(parsed.destination).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    return null;
  }

  for (const platform of SOCIAL_PLATFORMS) {
    if (
      hostname === platform.hostname ||
      hostname.endsWith(`.${platform.hostname}`)
    ) {
      return platform.icon;
    }
  }

  return null;
}
