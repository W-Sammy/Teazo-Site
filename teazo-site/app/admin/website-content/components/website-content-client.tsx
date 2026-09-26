"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TocItem } from "./section-shell";
import {
  IconLogo,
  IconStory,
  IconSocial,
  IconContact,
  IconHours,
  IconHolidays,
} from "./icons";
import LogoSection from "./sections/logo-section";
import StorySection from "./sections/story-section";
import SocialSection from "./sections/social-section";
import ContactSection from "./sections/contact-section";
import HoursSection from "./sections/hours-section";
import HolidaysSection from "./sections/holidays-section";
import { useWebsiteContent } from "../handlers/use-website-content";
import type { WebsiteContent } from "@/app/types/website-content";
import type { SectionId } from "./types";

// single source of order/labels for both the sidebar TocItems and the mobile dropdown
const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "logo", label: "Website Logo", icon: <IconLogo /> },
  { id: "story", label: "Our Story", icon: <IconStory /> },
  { id: "social", label: "Social Media", icon: <IconSocial /> },
  { id: "contact", label: "Contact Info", icon: <IconContact /> },
  { id: "hours", label: "Business Hours", icon: <IconHours /> },
  { id: "holidays", label: "Holiday Exceptions", icon: <IconHolidays /> },
];

export default function WebsiteContentClient({
  initialContent,
}: {
  initialContent: WebsiteContent;
}) {
  const {
    content,
    saveStatus,
    errorMessage,
    flushPatch,
    updateLogo,
    updateStory,
    updateAddress,
    updateDay,
    addSocialLink,
    updateSocialLink,
    removeSocialLink,
    addHoliday,
    updateHoliday,
    removeHoliday,
    updateContactFormEnabled,
  } = useWebsiteContent(initialContent);

  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const sectionRefs = useRef<
    Partial<Record<SectionId, HTMLDivElement | null>>
  >({});

  // Scroll after React has rendered the expanded section.
  useEffect(() => {
    if (!openSection) return;

    // rAF-deferred: wait for the accordion to expand (and its ref to reflect the new height)
    // before scrolling, otherwise scrollIntoView targets the pre-expand layout
    const frame = requestAnimationFrame(() => {
      sectionRefs.current[openSection]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [openSection]);

  // clicking the already-open section's TocItem/header collapses it instead of no-op re-opening
  function selectSection(id: SectionId) {
    setOpenSection((previous) => (previous === id ? null : id));
  }

  // per-section ref setter so AccordionItem's setRef prop can target sectionRefs.current[id]
  // without each section needing to know about the shared ref map
  function setSectionRef(id: SectionId) {
    return (el: HTMLDivElement | null) => {
      sectionRefs.current[id] = el;
    };
  }

  return (
    <div className="w-full min-w-0 px-3 pb-16 pt-6 sm:px-5 sm:pt-10">
      {errorMessage && (
        <div
          role="alert"
          className="fixed left-20 right-3 top-3 z-[60] break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg sm:left-auto sm:right-5 sm:top-5 sm:max-w-sm"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-5 flex min-w-0 flex-col gap-2 sm:mb-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-semibold leading-tight text-[#2b211d] sm:text-[26px]">
              Website Content
            </h1>
            {saveStatus === "saving" && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 animate-pulse"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-opacity duration-300"
              >
                <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                All changes saved
              </span>
            )}
            {saveStatus === "error" && (
              <span
                role="alert"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Save failed
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">
            Choose a section to open and edit its settings.
          </p>
        </div>
      </div>

      {/* Only place the menu beside the cards when there is enough room. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:gap-6 xl:grid-cols-[216px_minmax(0,1fr)] xl:gap-7">
        <nav
          aria-label="Website content sections"
          className="w-full min-w-0 rounded-2xl border border-[#ecdfd7] bg-[#fbf3ea] p-3 xl:sticky xl:top-10 xl:p-2.5"
        >
          {/* A full-width dropdown replaces the section sidebar on smaller screens. */}
          <div className="min-w-0 xl:hidden">
            <label
              htmlFor="website-content-section"
              className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[#a99584]"
            >
              Sections
            </label>
            <select
              id="website-content-section"
              value={openSection ?? ""}
              onChange={(event) =>
                selectSection(event.target.value as SectionId)
              }
              className="block min-h-11 w-full min-w-0 max-w-full cursor-pointer rounded-lg border border-[#ecdfd7] bg-white px-2.5 py-2 text-base text-[#4a3418] focus:border-[#dbb082] focus:outline-none"
            >
              <option value="" disabled>
                Choose a section
              </option>
              {SECTIONS.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden flex-col gap-1 xl:flex">
            <span className="px-3 pb-2 pt-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[#a99584]">
              Sections
            </span>
            {SECTIONS.map((section) => (
              <TocItem
                key={section.id}
                label={section.label}
                icon={section.icon}
                active={openSection === section.id}
                onClick={() => selectSection(section.id)}
              />
            ))}
          </div>
        </nav>

        <div className="flex w-full min-w-0 flex-col gap-3">
          <LogoSection
            logo={content.logo}
            isOpen={openSection === "logo"}
            onToggle={() => selectSection("logo")}
            setRef={setSectionRef("logo")}
            onLogoChange={updateLogo}
          />

          <StorySection
            story={content.story}
            isOpen={openSection === "story"}
            onToggle={() => selectSection("story")}
            setRef={setSectionRef("story")}
            onStoryChange={updateStory}
            onBlur={() => flushPatch()}
          />

          <SocialSection
            socialLinks={content.socialLinks}
            isOpen={openSection === "social"}
            onToggle={() => selectSection("social")}
            setRef={setSectionRef("social")}
            onUpdateLink={updateSocialLink}
            onAddLink={addSocialLink}
            onRemoveLink={removeSocialLink}
            onBlur={() => flushPatch()}
          />

          <ContactSection
            address={content.address}
            contactFormEnabled={content.contactFormEnabled}
            isOpen={openSection === "contact"}
            onToggle={() => selectSection("contact")}
            setRef={setSectionRef("contact")}
            onUpdateAddress={updateAddress}
            onUpdateContactFormEnabled={updateContactFormEnabled}
            onBlur={() => flushPatch()}
          />

          <HoursSection
            hours={content.hours}
            holidays={content.holidays}
            isOpen={openSection === "hours"}
            onToggle={() => selectSection("hours")}
            setRef={setSectionRef("hours")}
            onUpdateDay={updateDay}
          />

          <HolidaysSection
            holidays={content.holidays}
            isOpen={openSection === "holidays"}
            onToggle={() => selectSection("holidays")}
            setRef={setSectionRef("holidays")}
            onUpdateHoliday={updateHoliday}
            onRemoveHoliday={removeHoliday}
            onAddHoliday={addHoliday}
            onBlur={() => flushPatch()}
          />
        </div>
      </div>
    </div>
  );
} 