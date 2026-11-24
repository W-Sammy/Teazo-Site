import Image from "next/image";
import type { SocialLink } from "@/app/types/website-content";
import { parseAndNormalizeDestination } from "@/app/lib/website-content-validators";
import { getSocialPlatformIcon } from "@/app/lib/social-platform-icons";

/**
 * Display enabled social links with valid destinations.
 *
 * Recognized platform icons are determined by URL hostname,
 * not database IDs or user-entered platform labels.
 *
 * Unsupported destinations use TEAZO's existing custom
 * share icon rather than a hardcoded generic SVG.
 */
export default function SocialLinks({
  links = [],
  businessName,
  email,
}: {
  links?: SocialLink[];
  businessName: string;
  email: string;
}) {
  const safeLinks = links
    .filter(
      (link) =>
        link.enabled &&
        link.url &&
        link.url.trim(),
    )
    .map((link) => {
      const parsed = parseAndNormalizeDestination(link.url);

      if (!parsed.ok) return null;

      return {
        ...link,
        url: parsed.destination,
        isEmail: parsed.kind === "email",
        platformIcon: getSocialPlatformIcon(parsed.destination),
      };
    })
    .filter(
      (link): link is NonNullable<typeof link> =>
        link !== null,
    );

  const safeEmail =
    email && email.trim()
      ? parseAndNormalizeDestination(email)
      : null;

  const emailHref =
    safeEmail?.ok && safeEmail.kind === "email"
      ? safeEmail.destination
      : email && email.trim()
        ? `mailto:${email.trim()}`
        : "";

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
      {safeLinks.map((link) => {
        const isExternal = !link.isEmail;

        return (
          <a
            key={link.id}
            href={link.url}
            aria-label={`${businessName} on ${link.label}`}
            title={link.label}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer" : undefined}
            className="block transition hover:opacity-70"
          >
            {link.platformIcon ? (
              <Image
                src={link.platformIcon}
                alt=""
                aria-hidden="true"
                width={64}
                height={64}
                className="h-12 w-12 object-contain"
              />
            ) : (
              /*
               * Use Kaylina's existing TEAZO share icon for
               * unsupported destinations. It already contains
               * the correct gold artwork and transparent
               * background, so no additional styling is needed.
               */
              <Image
                src="/admin_icons/admin_svg/teazo_share_icon.svg"
                alt=""
                aria-hidden="true"
                width={64}
                height={64}
                className="h-12 w-12 object-contain"
                data-testid="generic-social-icon"
              />
            )}
          </a>
        );
      })}

      {emailHref && (
        <a
          href={emailHref}
          aria-label={`Email ${businessName}`}
          className="block transition hover:opacity-70"
        >
          <Image
            src="/social_icons/social_svg/teazo_email_icon.svg"
            alt=""
            aria-hidden="true"
            width={64}
            height={64}
            className="h-12 w-12 object-contain"
          />
        </a>
      )}
    </div>
  );
}
