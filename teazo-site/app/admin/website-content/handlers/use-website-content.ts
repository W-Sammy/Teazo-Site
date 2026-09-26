"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AddressInfo,
  DayHours,
  Holiday,
  SocialLink,
  WebsiteContent,
} from "@/app/types/website-content";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

function createTemporaryId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Owns website content state and the update operations for every section.
 * Automatically debounces frequent input changes (typing in story/address/social/holidays,
 * slider dragging) and immediately flushes discrete user actions (add/remove/toggle).
 */
export function useWebsiteContent(initialContent: WebsiteContent) {
  const [content, setContent] = useState<WebsiteContent>(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const pendingPatchRef = useRef<Partial<WebsiteContent>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const hasPendingDuringSaveRef = useRef<boolean>(false);

  const flushPatch = async (immediatePatch?: Partial<WebsiteContent>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (immediatePatch) {
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...immediatePatch,
        ...(immediatePatch.address
          ? {
              address: {
                ...(pendingPatchRef.current.address ?? {}),
                ...immediatePatch.address,
              },
            }
          : {}),
      };
    }

    if (Object.keys(pendingPatchRef.current).length === 0) {
      return;
    }

    if (isSavingRef.current) {
      hasPendingDuringSaveRef.current = true;
      return;
    }

    const payload = { ...pendingPatchRef.current };
    pendingPatchRef.current = {};

    isSavingRef.current = true;
    setSaveStatus("saving");

    try {
      const res = await fetch("/api/website-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaveStatus((current) => (current === "saved" ? "idle" : current));
      }, 3000);
    } catch {
      setSaveStatus("error");
      setErrorMessage("Failed to save changes. Please try again.");
    } finally {
      isSavingRef.current = false;
      if (hasPendingDuringSaveRef.current || Object.keys(pendingPatchRef.current).length > 0) {
        hasPendingDuringSaveRef.current = false;
        flushPatch();
      }
    }
  };

  const queuePatch = (patch: Partial<WebsiteContent>, delayMs = 600) => {
    pendingPatchRef.current = {
      ...pendingPatchRef.current,
      ...patch,
      ...(patch.address
        ? {
            address: {
              ...(pendingPatchRef.current.address ?? {}),
              ...patch.address,
            },
          }
        : {}),
    };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      flushPatch();
    }, delayMs);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (Object.keys(pendingPatchRef.current).length > 0) {
        fetch("/api/website-content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingPatchRef.current),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function updateLogo(dataUrl: string) {
    setErrorMessage("");
    try {
      setContent((prev) => ({ ...prev, logo: dataUrl }));
      flushPatch({ logo: dataUrl });
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
      queuePatch({ story }, 600);
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
      queuePatch({ address: updatedAddress }, 600);
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
      queuePatch({ hours: updatedHours }, 400);
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
      flushPatch({ socialLinks: updatedLinks });
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
      if (patch.enabled !== undefined) {
        flushPatch({ socialLinks: updatedLinks });
      } else {
        queuePatch({ socialLinks: updatedLinks }, 600);
      }
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
      flushPatch({ socialLinks: updatedLinks });
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
      flushPatch({ holidays: updatedHolidays });
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
      if (patch.closed !== undefined) {
        flushPatch({ holidays: updatedHolidays });
      } else {
        queuePatch({ holidays: updatedHolidays }, 600);
      }
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
      flushPatch({ holidays: updatedHolidays });
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
      flushPatch({ contactFormEnabled: enabled });
      return true;
    } catch {
      setErrorMessage("Failed to update Contact Us form setting.");
      return false;
    }
  }

  return {
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
  };
}

