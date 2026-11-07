"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconSocial } from "../icons";
import { fieldClass, ErrorText } from "../field-controls";
import { parseAndNormalizeDestination, MAX_SOCIAL_LINKS } from "../validators";
import type { SocialLink } from "@/app/types/website-content";

type FieldTouch = { label?: boolean; url?: boolean };

export default function SocialSection({
  socialLinks,
  isOpen,
  onToggle,
  setRef,
  onUpdateLink,
  onAddLink,
  onRemoveLink,
  onBlur,
}: {
  socialLinks: SocialLink[];
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateLink: (id: string, patch: Partial<SocialLink>) => void;
  onAddLink: () => void;
  onRemoveLink: (id: string) => void;
  onBlur?: () => void;
}) {
  const [touched, setTouched] = useState<Record<string, FieldTouch>>({});

  function markTouched(id: string, field: keyof FieldTouch) {
    setTouched((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: true },
    }));
    onBlur?.();
  }

  // label/url are only required of each other, not independently, so a fully blank
  // row (freshly added, untouched) doesn't error, but a half-filled one does
  function fieldErrors(link: SocialLink) {
    const t = touched[link.id] ?? {};
    const labelEmpty = !link.label.trim();
    const urlEmpty = !link.url.trim();

    let labelError: string | undefined;
    let urlError: string | undefined;

    if (t.label && labelEmpty && !urlEmpty) {
      labelError = "Platform name required";
    }

    if (t.url) {
      if (urlEmpty && !labelEmpty) {
        urlError = "Link required";
      } else if (!urlEmpty) {
        const dest = parseAndNormalizeDestination(link.url);
        if (!dest.ok) {
          urlError = dest.error;
        }
      }
    }

    return { labelError, urlError };
  }

  return (
    <AccordionItem
      id="social"
      label="Social Media"
      icon={<IconSocial />}
      isOpen={isOpen}
      onToggle={onToggle}
      setRef={setRef}
    >
      <p className="mb-1 text-xs text-gray-400">
        Links shown as icons in the site footer. Supported platforms (Facebook, Instagram, Yelp) automatically display their official brand icons; other destinations use a generic link icon. Custom icon uploads are not supported.
      </p>

      <div className="flex min-w-0 flex-col divide-y divide-[#f3ece4]">
        {socialLinks.map((link) => {
          const { labelError, urlError } = fieldErrors(link);

          return (
            <div
              key={link.id}
              className="flex min-w-0 flex-col gap-1.5 py-3.5 first:pt-3 last:pb-0"
            >
              {/* Mobile: icon/actions, platform, then URL. Desktop: one row. */}
              <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 lg:grid-cols-[40px_96px_minmax(0,1fr)_auto] lg:gap-x-4">
                <div
                  title={link.label ? `${link.label} icon` : "Social media icon"}
                  className="col-start-1 row-start-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbf3ea]"
                >
                  {link.icon ? (
                    <img
                      src={link.icon}
                      alt={link.label || "Platform icon"}
                      className="h-6 w-6 object-contain"
                    />
                  ) : (
                    <span className="text-[#a99584]">
                      <img
                        src="/admin_icons/admin_svg/teazo_share_icon.svg"
                        alt="Generic Link"
                        className="h-6 w-6 object-contain"
                      /> 
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  value={link.label}
                  onChange={(e) =>
                    onUpdateLink(link.id, { label: e.target.value })
                  }
                  onBlur={() => markTouched(link.id, "label")}
                  placeholder="Platform"
                  aria-label="Social media platform"
                  className={`${fieldClass(
                    Boolean(labelError)
                  )} col-span-3 row-start-2 font-semibold text-[#4a3418] lg:col-span-1 lg:col-start-2 lg:row-start-1`}
                />

                <input
                  type="text"
                  value={link.url}
                  onChange={(e) =>
                    onUpdateLink(link.id, { url: e.target.value })
                  }
                  onBlur={() => {
                    markTouched(link.id, "url");
                    const parsed = parseAndNormalizeDestination(link.url);
                    if (parsed.ok && parsed.destination !== link.url) {
                      onUpdateLink(link.id, { url: parsed.destination });
                    }
                  }}
                  placeholder={link.label ? `${link.label} link` : "Link"}
                  aria-label={
                    link.label ? `${link.label} link` : "Social media link"
                  }
                  className={`${fieldClass(
                    Boolean(urlError)
                  )} col-span-3 row-start-3 lg:col-span-1 lg:col-start-3 lg:row-start-1`}
                />

                <div className="col-start-3 row-start-1 flex items-center gap-2 lg:col-start-4 lg:gap-4">
                  {/* Keep the switch appearance, but enlarge its mobile hit area. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={link.enabled}
                    aria-label={`Show ${
                      link.label || "social media link"
                    } in the footer`}
                    onClick={() =>
                      onUpdateLink(link.id, { enabled: !link.enabled })
                    }
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
                  >
                    <span
                      className={`relative block h-[18px] w-8 rounded-full transition-colors ${
                        link.enabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                          link.enabled ? "left-4" : "left-0.5"
                        }`}
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={`Remove ${
                      link.label || "social media link"
                    }`}
                    onClick={() => onRemoveLink(link.id)}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2] lg:h-5 lg:w-5"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
              </div>

              {(() => {
                const parsed = link.url.trim() ? parseAndNormalizeDestination(link.url) : null;
                const showPreview = parsed?.ok && parsed.destination !== link.url.trim();

                if (!labelError && !urlError && !showPreview) return null;

                return (
                  <div className="flex min-w-0 flex-col gap-0.5 lg:ml-14">
                    {labelError && <ErrorText>{labelError}</ErrorText>}
                    {urlError && <ErrorText>{urlError}</ErrorText>}
                    {showPreview && (
                      <span className="text-[11px] text-[#8c6b47]">
                        Will save as: <span className="font-mono">{parsed.destination}</span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddLink}
        disabled={socialLinks.length >= MAX_SOCIAL_LINKS}
        className="mt-4 min-h-11 w-full cursor-pointer rounded-2xl bg-[#F59AA3] px-[18px] py-2 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-black disabled:cursor-not-allowed disabled:bg-[#FFBDC7] sm:min-h-0 sm:w-auto"
      >
        New Social Media +
      </button>
      {socialLinks.length >= MAX_SOCIAL_LINKS && (
        <p className="mt-2 text-xs text-amber-700">
          Maximum limit of {MAX_SOCIAL_LINKS} social links reached. Delete an existing link to add another.
        </p>
      )}
    </AccordionItem>
  );
}
