"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconSocial } from "../icons";
import { fieldClass, ErrorText } from "../field-controls";
import { isValidImageFile, isValidUrlOrEmail } from "../validators";
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
}: {
  socialLinks: SocialLink[];
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateLink: (id: string, patch: Partial<SocialLink>) => void;
  onAddLink: () => void;
  onRemoveLink: (id: string) => void;
}) {
  const [touched, setTouched] = useState<Record<string, FieldTouch>>({});
  const [iconErrors, setIconErrors] = useState<Record<string, string>>({});

  function markTouched(id: string, field: keyof FieldTouch) {
    setTouched((prev) => ({ ...prev, [id]: { ...prev[id], [field]: true } }));
  }

  // label/url are only required of each other, not independently, so a fully blank
  // row (freshly added, untouched) doesn't error, but a half-filled one does
  function fieldErrors(link: SocialLink) {
    const t = touched[link.id] ?? {};
    const labelEmpty = !link.label.trim();
    const urlEmpty = !link.url.trim();

    let labelError: string | undefined;
    let urlError: string | undefined;

    if (t.label && labelEmpty && !urlEmpty) labelError = "Platform name required";
    if (t.url) {
      if (urlEmpty && !labelEmpty) urlError = "Link required";
      else if (!urlEmpty && !isValidUrlOrEmail(link.url)) urlError = "Enter a valid link or email";
    }

    return { labelError, urlError };
  }

  function handleIconFile(id: string, file: File | undefined) {
    if (!file) return;

    const check = isValidImageFile(file);
    if (!check.valid) {
      setIconErrors((prev) => ({ ...prev, [id]: check.error ?? "Invalid image file" }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setIconErrors((prev) => ({ ...prev, [id]: "" }));
        onUpdateLink(id, { icon: reader.result });
      }
    };
    reader.onerror = () => setIconErrors((prev) => ({ ...prev, [id]: "Couldn't read that image file" }));
    reader.readAsDataURL(file);
  }

  return (
    <AccordionItem id="social" label="Social Media" icon={<IconSocial />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <p className="mb-1 text-xs text-gray-400">Links shown as icons in the site footer.</p>
      <div className="flex flex-col divide-y divide-[#f3ece4]">
        {socialLinks.map((link) => {
          const { labelError, urlError } = fieldErrors(link);
          const iconError = iconErrors[link.id];

          return (
            <div key={link.id} className="flex flex-col gap-1.5 py-3.5 first:pt-3 last:pb-0">
              <div className="flex min-w-0 items-center gap-4">
                <label
                  htmlFor={`social-icon-${link.id}`}
                  title="Change logo"
                  className="group relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#fbf3ea]"
                >
                  {link.icon ? (
                    <img src={link.icon} alt={link.label} className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="text-[#a99584]">
                      <IconSocial />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Edit
                  </span>
                  {/* visually hidden; the styled label above is the actual click target that opens the file picker */}
                  <input
                    id={`social-icon-${link.id}`}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleIconFile(link.id, e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => onUpdateLink(link.id, { label: e.target.value })}
                  onBlur={() => markTouched(link.id, "label")}
                  placeholder="Platform"
                  className={`${fieldClass(Boolean(labelError))} !w-24 shrink-0 font-semibold text-[#4a3418]`}
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => onUpdateLink(link.id, { url: e.target.value })}
                  onBlur={() => markTouched(link.id, "url")}
                  placeholder={link.label ? `${link.label} link` : "Link"}
                  className={`${fieldClass(Boolean(urlError))} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => onUpdateLink(link.id, { enabled: !link.enabled })}
                  className={`relative h-[18px] w-8 shrink-0 cursor-pointer rounded-full transition-colors ${
                    link.enabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      link.enabled ? "left-4" : "left-0.5"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveLink(link.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2]"
                >
                  <span className="text-[10px] leading-none">✕</span>
                </button>
              </div>
              {(labelError || urlError || iconError) && (
                <div className="ml-14 flex flex-col gap-0.5">
                  {iconError && <ErrorText>{iconError}</ErrorText>}
                  {labelError && <ErrorText>{labelError}</ErrorText>}
                  {urlError && <ErrorText>{urlError}</ErrorText>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddLink}
        className="mt-4 cursor-pointer rounded-2xl bg-[#FFBDC7] px-[18px] py-2 text-[13px] font-semibold text-white hover:bg-[#F59AA3]"
      >
        New Social Media +
      </button>
    </AccordionItem>
  );
}
