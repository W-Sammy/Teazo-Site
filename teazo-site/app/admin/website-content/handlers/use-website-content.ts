"use client";

import { useState } from "react";
import type {
  AddressInfo,
  DayHours,
  Holiday,
  SocialLink,
  WebsiteContent,
} from "@/app/types/website-content";

function createTemporaryId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Owns website content state and the update operations for every section.
 * Replace the marked temporary blocks with API calls when persistence is ready.
 * Text-field actions (story, address) should be called on blur/save once wired
 * to the real endpoint, not on every keystroke.
 */
export function useWebsiteContent(initialContent: WebsiteContent) {
  const [content, setContent] = useState(initialContent);
  const [errorMessage, setErrorMessage] = useState("");

  async function persistPatch(patch: Partial<WebsiteContent>) {
    try {
      await fetch("/api/website-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      // Graceful fallback for offline / test environments
    }
  }

  function updateLogo(dataUrl: string) {
    setErrorMessage("");
    try {
      setContent((prev) => ({ ...prev, logo: dataUrl }));
      persistPatch({ logo: dataUrl });
      return true;
    } catch {
      setErrorMessage("Failed to update the logo.");
      return false;
    }
  }

  function updateStory(story: string) {
    setErrorMessage("");
    try {
      setContent((prev) => ({ ...prev, story }));
      persistPatch({ story });
      return true;
    } catch {
      setErrorMessage("Failed to update the story.");
      return false;
    }
  }

  function updateAddress(patch: Partial<AddressInfo>) {
    setErrorMessage("");
    try {
      const updatedAddress = { ...content.address, ...patch };
      setContent((prev) => ({ ...prev, address: updatedAddress }));
      persistPatch({ address: updatedAddress });
      return true;
    } catch {
      setErrorMessage("Failed to update contact info.");
      return false;
    }
  }

  function updateDay(index: number, patch: Partial<DayHours>) {
    setErrorMessage("");
    try {
      const updatedHours = content.hours.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      );
      setContent((prev) => ({ ...prev, hours: updatedHours }));
      persistPatch({ hours: updatedHours });
      return true;
    } catch {
      setErrorMessage("Failed to update business hours.");
      return false;
    }
  }

  function addSocialLink() {
    setErrorMessage("");
    try {
      const id = createTemporaryId("social");
      const updatedLinks = [
        ...content.socialLinks,
        { id, label: "", icon: "", url: "", enabled: true },
      ];
      setContent((prev) => ({ ...prev, socialLinks: updatedLinks }));
      persistPatch({ socialLinks: updatedLinks });
      return true;
    } catch {
      setErrorMessage("Failed to add the social link.");
      return false;
    }
  }

  function updateSocialLink(id: string, patch: Partial<SocialLink>) {
    setErrorMessage("");
    try {
      const updatedLinks = content.socialLinks.map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      );
      setContent((prev) => ({ ...prev, socialLinks: updatedLinks }));
      persistPatch({ socialLinks: updatedLinks });
      return true;
    } catch {
      setErrorMessage("Failed to update the social link.");
      return false;
    }
  }

  function removeSocialLink(id: string) {
    setErrorMessage("");
    try {
      const updatedLinks = content.socialLinks.filter((link) => link.id !== id);
      setContent((prev) => ({ ...prev, socialLinks: updatedLinks }));
      persistPatch({ socialLinks: updatedLinks });
      return true;
    } catch {
      setErrorMessage("Failed to remove the social link.");
      return false;
    }
  }

  function addHoliday() {
    setErrorMessage("");
    try {
      const id = createTemporaryId("holiday");
      const updatedHolidays = [
        ...content.holidays,
        { id, name: "", date: "", closed: true },
      ];
      setContent((prev) => ({ ...prev, holidays: updatedHolidays }));
      persistPatch({ holidays: updatedHolidays });
      return true;
    } catch {
      setErrorMessage("Failed to add the holiday.");
      return false;
    }
  }

  function updateHoliday(id: string, patch: Partial<Holiday>) {
    setErrorMessage("");
    try {
      const updatedHolidays = content.holidays.map((holiday) =>
        holiday.id === id ? { ...holiday, ...patch } : holiday,
      );
      setContent((prev) => ({ ...prev, holidays: updatedHolidays }));
      persistPatch({ holidays: updatedHolidays });
      return true;
    } catch {
      setErrorMessage("Failed to update the holiday.");
      return false;
    }
  }

  function removeHoliday(id: string) {
    setErrorMessage("");
    try {
      const updatedHolidays = content.holidays.filter((holiday) => holiday.id !== id);
      setContent((prev) => ({ ...prev, holidays: updatedHolidays }));
      persistPatch({ holidays: updatedHolidays });
      return true;
    } catch {
      setErrorMessage("Failed to remove the holiday.");
      return false;
    }
  }

  function updateContactFormEnabled(enabled: boolean) {
    setErrorMessage("");
    try {
      setContent((prev) => ({ ...prev, contactFormEnabled: enabled }));
      persistPatch({ contactFormEnabled: enabled });
      return true;
    } catch {
      setErrorMessage("Failed to update Contact Us form setting.");
      return false;
    }
  }

  return {
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
    updateContactFormEnabled,
  };
}

