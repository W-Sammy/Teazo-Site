import Image from "next/image";
import type { SocialLink } from "@/app/types/website-content";
import { parseAndNormalizeDestination } from "@/app/lib/website-content-validators";

/** Render only stored, enabled links with a valid, safe destination, including custom platforms. */
export default function SocialLinks({ links = [], businessName, email }: {
  links?: SocialLink[];
  businessName: string;
  email: string;
}) {
  const safeLinks = links
    .filter((link) => link.enabled && link.url && link.url.trim())
    .map((link) => {
      const parsed = parseAndNormalizeDestination(link.url);
      if (!parsed.ok) return null;
      return {
        ...link,
        url: parsed.destination,
        isEmail: parsed.kind === "email",
      };
    })
    .filter((link): link is NonNullable<typeof link> => link !== null);

  const safeEmail = email && email.trim() ? parseAndNormalizeDestination(email) : null;
  const emailHref = safeEmail?.ok && safeEmail.kind === "email"
    ? safeEmail.destination
    : (email && email.trim() ? `mailto:${email.trim()}` : "");

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
            {link.icon ? (
              <Image
                src={link.icon}
                alt=""
                aria-hidden="true"
                width={64}
                height={64}
                unoptimized={link.icon.startsWith("data:")}
                className="h-12 w-12 object-contain"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
                </svg>
              </span>
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
