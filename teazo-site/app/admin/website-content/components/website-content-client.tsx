"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { TocItem } from "./section-shell";
import { IconLogo, IconStory, IconSocial, IconContact, IconHours, IconHolidays } from "./icons";
import LogoSection from "./sections/logo-section";
import StorySection from "./sections/story-section";
import SocialSection from "./sections/social-section";
import ContactSection from "./sections/contact-section";
import HoursSection from "./sections/hours-section";
import HolidaysSection from "./sections/holidays-section";
import { useWebsiteContent } from "../handlers/use-website-content";
import type { WebsiteContent } from "@/app/types/website-content";
import type { SectionId } from "./types";

// single source of order/labels for both the sidebar TocItems and the accordion cards below
const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "logo", label: "Website Logo", icon: <IconLogo /> },
  { id: "story", label: "Our Story", icon: <IconStory /> },
  { id: "social", label: "Social Media", icon: <IconSocial /> },
  { id: "contact", label: "Contact Info", icon: <IconContact /> },
  { id: "hours", label: "Business Hours", icon: <IconHours /> },
  { id: "holidays", label: "Holiday Exceptions", icon: <IconHolidays /> },
];

export default function WebsiteContentClient({ initialContent }: { initialContent: WebsiteContent }) {
  const {
    content,
    errorMessage,
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
  } = useWebsiteContent(initialContent);
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  // clicking the already-open section's TocItem/header collapses it instead of no-op re-opening
  function selectSection(id: SectionId) {
    setOpenSection((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        // rAF-deferred: wait for the accordion to expand (and its ref to reflect the new height)
        // before scrolling, otherwise scrollIntoView targets the pre-expand layout
        requestAnimationFrame(() => {
          sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }

  // per-section ref setter so AccordionItem's setRef prop can target sectionRefs.current[id]
  // without each section needing to know about the shared ref map
  function setSectionRef(id: SectionId) {
    return (el: HTMLDivElement | null) => {
      sectionRefs.current[id] = el;
    };
  }

  return (
    <div className="pl-5 pr-5 pt-10 pb-16">
      {errorMessage && (
        <div
          role="alert"
          className="fixed right-5 top-5 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-7">
        <h1 className="text-[26px] font-semibold text-[#2b211d]">Website Content</h1>
        <p className="mt-1 text-xs text-gray-400">
          Sections on the left jump to and expand the matching card on the right.
        </p>
      </div>

      <div className="flex items-start gap-7">
        <nav className="sticky top-10 flex w-[216px] shrink-0 flex-col gap-1 rounded-2xl border border-[#ecdfd7] bg-[#fbf3ea] p-2.5">
          <span className="px-3 pb-2 pt-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[#a99584]">
            Sections
          </span>
          {SECTIONS.map((s) => (
            <TocItem
              key={s.id}
              label={s.label}
              icon={s.icon}
              active={openSection === s.id}
              onClick={() => selectSection(s.id)}
            />
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
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
          />

          <SocialSection
            socialLinks={content.socialLinks}
            isOpen={openSection === "social"}
            onToggle={() => selectSection("social")}
            setRef={setSectionRef("social")}
            onUpdateLink={updateSocialLink}
            onAddLink={addSocialLink}
            onRemoveLink={removeSocialLink}
          />

          <ContactSection
            address={content.address}
            isOpen={openSection === "contact"}
            onToggle={() => selectSection("contact")}
            setRef={setSectionRef("contact")}
            onUpdateAddress={updateAddress}
          />

          <HoursSection
            hours={content.hours}
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
          />
        </div>
      </div>
    </div>
  );
}
