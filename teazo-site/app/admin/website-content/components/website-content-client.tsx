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
import {
  INITIAL_LOGO,
  INITIAL_HOURS,
  INITIAL_HOLIDAYS,
  INITIAL_SOCIAL_LINKS,
  INITIAL_STORY,
  INITIAL_ADDRESS,
} from "./types";
import type { DayHours, Holiday, SocialLink, AddressInfo, SectionId } from "./types";

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "logo", label: "Website Logo", icon: <IconLogo /> },
  { id: "story", label: "Our Story", icon: <IconStory /> },
  { id: "social", label: "Social Media", icon: <IconSocial /> },
  { id: "contact", label: "Contact Info", icon: <IconContact /> },
  { id: "hours", label: "Business Hours", icon: <IconHours /> },
  { id: "holidays", label: "Holiday Exceptions", icon: <IconHolidays /> },
];

export default function WebsiteContentClient() {
  const [logo, setLogo] = useState(INITIAL_LOGO);
  const [holidays, setHolidays] = useState<Holiday[]>(INITIAL_HOLIDAYS);
  const [hours, setHours] = useState<DayHours[]>(INITIAL_HOURS);
  const [story, setStory] = useState(INITIAL_STORY);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(INITIAL_SOCIAL_LINKS);
  const [address, setAddress] = useState<AddressInfo>(INITIAL_ADDRESS);
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  function selectSection(id: SectionId) {
    setOpenSection((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        requestAnimationFrame(() => {
          sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }

  function setSectionRef(id: SectionId) {
    return (el: HTMLDivElement | null) => {
      sectionRefs.current[id] = el;
    };
  }

  function updateSocialLink(id: string, patch: Partial<SocialLink>) {
    setSocialLinks((prev) => prev.map((link) => (link.id === id ? { ...link, ...patch } : link)));
  }

  function addSocialLink() {
    const id = `social-${Date.now()}`;
    setSocialLinks((prev) => [...prev, { id, label: "", icon: "", url: "", enabled: true }]);
  }

  function removeSocialLink(id: string) {
    setSocialLinks((prev) => prev.filter((link) => link.id !== id));
  }

  function updateAddress(patch: Partial<AddressInfo>) {
    setAddress((prev) => ({ ...prev, ...patch }));
  }

  function updateDay(index: number, patch: Partial<DayHours>) {
    setHours((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function updateHoliday(id: string, patch: Partial<Holiday>) {
    setHolidays((prev) => prev.map((holiday) => (holiday.id === id ? { ...holiday, ...patch } : holiday)));
  }

  function removeHoliday(id: string) {
    setHolidays((prev) => prev.filter((holiday) => holiday.id !== id));
  }

  function addHoliday() {
    const id = `holiday-${Date.now()}`;
    setHolidays((prev) => [...prev, { id, name: "", date: "" }]);
  }

  return (
    <div className="pl-5 pr-5 pt-10 pb-16">
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
            logo={logo}
            isOpen={openSection === "logo"}
            onToggle={() => selectSection("logo")}
            setRef={setSectionRef("logo")}
            onLogoChange={setLogo}
          />

          <StorySection
            story={story}
            isOpen={openSection === "story"}
            onToggle={() => selectSection("story")}
            setRef={setSectionRef("story")}
            onStoryChange={setStory}
          />

          <SocialSection
            socialLinks={socialLinks}
            isOpen={openSection === "social"}
            onToggle={() => selectSection("social")}
            setRef={setSectionRef("social")}
            onUpdateLink={updateSocialLink}
            onAddLink={addSocialLink}
            onRemoveLink={removeSocialLink}
          />

          <ContactSection
            address={address}
            isOpen={openSection === "contact"}
            onToggle={() => selectSection("contact")}
            setRef={setSectionRef("contact")}
            onUpdateAddress={updateAddress}
          />

          <HoursSection
            hours={hours}
            isOpen={openSection === "hours"}
            onToggle={() => selectSection("hours")}
            setRef={setSectionRef("hours")}
            onUpdateDay={updateDay}
          />

          <HolidaysSection
            holidays={holidays}
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
