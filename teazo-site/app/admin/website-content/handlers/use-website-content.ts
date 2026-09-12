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

  function updateLogo(dataUrl: string) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content { logo }. */
      setContent((prev) => ({ ...prev, logo: dataUrl }));
      return true;
    } catch {
      setErrorMessage("Failed to update the logo.");
      return false;
    }
  }

  function updateStory(story: string) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content { story }. */
      setContent((prev) => ({ ...prev, story }));
      return true;
    } catch {
      setErrorMessage("Failed to update the story.");
      return false;
    }
  }

  function updateAddress(patch: Partial<AddressInfo>) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content { address }. */
      setContent((prev) => ({ ...prev, address: { ...prev.address, ...patch } }));
      return true;
    } catch {
      setErrorMessage("Failed to update contact info.");
      return false;
    }
  }

  function updateDay(index: number, patch: Partial<DayHours>) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content { hours } (send the full 7-day array). */
      setContent((prev) => ({
        ...prev,
        hours: prev.hours.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
      }));
      return true;
    } catch {
      setErrorMessage("Failed to update business hours.");
      return false;
    }
  }

  function addSocialLink() {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with POST /api/website-content/social-links. */
      const id = createTemporaryId("social");
      setContent((prev) => ({
        ...prev,
        socialLinks: [...prev.socialLinks, { id, label: "", icon: "", url: "", enabled: true }],
      }));
      return true;
    } catch {
      setErrorMessage("Failed to add the social link.");
      return false;
    }
  }

  function updateSocialLink(id: string, patch: Partial<SocialLink>) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content/social-links/:id. */
      setContent((prev) => ({
        ...prev,
        socialLinks: prev.socialLinks.map((link) => (link.id === id ? { ...link, ...patch } : link)),
      }));
      return true;
    } catch {
      setErrorMessage("Failed to update the social link.");
      return false;
    }
  }

  function removeSocialLink(id: string) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with DELETE /api/website-content/social-links/:id. */
      setContent((prev) => ({
        ...prev,
        socialLinks: prev.socialLinks.filter((link) => link.id !== id),
      }));
      return true;
    } catch {
      setErrorMessage("Failed to remove the social link.");
      return false;
    }
  }

  function addHoliday() {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with POST /api/website-content/holidays. */
      const id = createTemporaryId("holiday");
      setContent((prev) => ({
        ...prev,
        holidays: [...prev.holidays, { id, name: "", date: "" }],
      }));
      return true;
    } catch {
      setErrorMessage("Failed to add the holiday.");
      return false;
    }
  }

  function updateHoliday(id: string, patch: Partial<Holiday>) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with PATCH /api/website-content/holidays/:id. */
      setContent((prev) => ({
        ...prev,
        holidays: prev.holidays.map((holiday) => (holiday.id === id ? { ...holiday, ...patch } : holiday)),
      }));
      return true;
    } catch {
      setErrorMessage("Failed to update the holiday.");
      return false;
    }
  }

  function removeHoliday(id: string) {
    setErrorMessage("");
    try {
      /* TODO: Replace this temporary block with DELETE /api/website-content/holidays/:id. */
      setContent((prev) => ({
        ...prev,
        holidays: prev.holidays.filter((holiday) => holiday.id !== id),
      }));
      return true;
    } catch {
      setErrorMessage("Failed to remove the holiday.");
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
  };
}
