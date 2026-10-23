"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AddressInfo,
  DayHours,
  Holiday,
  SocialLink,
  CarouselImage,
  WebsiteContent,
} from "@/app/types/website-content";
import {
  validateAddress,
  isValidImageFile,
  validateHolidays,
  validateSocialLinks,
  validateStory,
  validateWebsiteContentPatch,
} from "@/app/lib/website-content-validators";

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
 * Enforces validation so invalid formatting is never persisted.
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

  const flushPatch = async (
    immediatePatch?: Partial<WebsiteContent>,
    validationError?: string,
  ) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (validationError) {
      setSaveStatus("error");
      setErrorMessage(validationError);
      return;
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

    // Guard: Validate the patch before sending to the server
    const validation = validateWebsiteContentPatch(pendingPatchRef.current);
    if (!validation.valid) {
      setSaveStatus("error");
      setErrorMessage(validation.errors[0] || "Please fix formatting errors before saving.");
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
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || `Server returned ${res.status}`);
      }

      setSaveStatus("saved");
      setErrorMessage("");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaveStatus((current) => (current === "saved" ? "idle" : current));
      }, 3000);
    } catch (err: unknown) {
      setSaveStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to save changes. Please try again.");
    } finally {
      isSavingRef.current = false;
      if (hasPendingDuringSaveRef.current || Object.keys(pendingPatchRef.current).length > 0) {
        hasPendingDuringSaveRef.current = false;
        flushPatch();
      }
    }
  };

  const queuePatch = (patch: Partial<WebsiteContent>, delayMs = 600) => {
    // Only queue if the patch is valid
    const validation = validateWebsiteContentPatch(patch);
    if (!validation.valid) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

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
        const validation = validateWebsiteContentPatch(pendingPatchRef.current);
        if (validation.valid) {
          fetch("/api/website-content", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pendingPatchRef.current),
            keepalive: true,
          }).catch(() => {});
        }
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
    try {
      setContent((prev) => ({ ...prev, story }));
      const { valid } = validateStory(story);
      if (valid) {
        setErrorMessage("");
        if (saveStatus === "error") setSaveStatus("idle");
        queuePatch({ story }, 600);
      } else {
        delete pendingPatchRef.current.story;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      }
      return true;
    } catch {
      setErrorMessage("Failed to update the story.");
      return false;
    }
  }

  function updateAddress(patch: Partial<AddressInfo>) {
    try {
      const updatedAddress = { ...content.address, ...patch };
      setContent((prev) => ({ ...prev, address: updatedAddress }));

      const { valid } = validateAddress(updatedAddress);
      if (valid) {
        setErrorMessage("");
        if (saveStatus === "error") setSaveStatus("idle");
        queuePatch({ address: updatedAddress }, 600);
      } else {
        if (pendingPatchRef.current.address) {
          delete pendingPatchRef.current.address;
        }
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      }
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

  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>(initialContent.carouselImages ?? []);
  const carouselImagesRef = useRef(carouselImages);
  type CarouselSettings = { alt?: string; enabled?: boolean };
  type CarouselStates = Record<string, "saving" | "saved" | "error">;

  const carouselPendingRef = useRef(new Map<string, CarouselSettings>());
  const carouselTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const carouselSavingRef = useRef(new Set<string>());
  const [carouselSaveStates, setCarouselSaveStates] = useState<CarouselStates>({});
  const [carouselSaveErrors, setCarouselSaveErrors] = useState<Record<string, string>>({});
  const [carouselFileStates, setCarouselFileStates] = useState<CarouselStates>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const carouselFileBusyRef = useRef(new Set<string>());
  const [carouselReady, setCarouselReady] = useState(false);
  const [carouselLoadError, setCarouselLoadError] = useState("");
  const [carouselLoadAttempt, setCarouselLoadAttempt] = useState(0);
  const [carouselSavedRecently, setCarouselSavedRecently] = useState(false);

  const carouselHasError = Object.values(carouselSaveStates).includes("error");
  const carouselStates = [...Object.values(carouselSaveStates), ...Object.values(carouselFileStates)];
  const carouselHasAnyError = carouselStates.includes("error");
  const carouselHasSaving = carouselStates.includes("saving");
  const carouselHasSaved = carouselStates.includes("saved");

  // show saved message for three seconds
  useEffect(() => {
    // hide saved message if work is still saving, an error exists, or nothing has been saved
    if (carouselHasSaving || carouselHasAnyError || !carouselHasSaved) {
      setCarouselSavedRecently(false);
      return;
    }

    // show the saved message, hide it after 3 seconds & cancel timer
    setCarouselSavedRecently(true);
    const timer = setTimeout(() => setCarouselSavedRecently(false), 3000);
    return () => clearTimeout(timer);
  }, [carouselHasSaving, carouselHasAnyError, carouselHasSaved]);

  // error takes priority, then saving, then saved confirmation
  let carouselSaveStatus: SaveStatus = "idle";
  if (carouselHasAnyError) 
    carouselSaveStatus = "error";
  else if (carouselHasSaving) 
    carouselSaveStatus = "saving";
  else if (carouselSavedRecently) 
    carouselSaveStatus = "saved";

  // all carousel requests use the same address & response/error checks
  async function requestCarousel(method: string, body: object, fallback: string) {
    const isFile = body instanceof FormData;
    const response = await fetch("/api/admin/website-content/carousel", {
      method,
      ...(isFile ? {} : { headers: { "Content-Type": "application/json" } }),
      body: isFile ? body : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null) as {
      success?: boolean; error?: string; images?: CarouselImage[];
      url?: string; key?: string; image?: { id?: string };
    } | null;

    // uploads return an img; other requests need to explicitly confirm success
    if (!response.ok || (!isFile && result?.success !== true))
      throw new Error(typeof result?.error === "string" ? result.error : fallback);
    
    return result;
  }

  // stop an img's typing timer so blur/toggles don't send the same save twice
  function cancelCarouselTimer(id: string) {
    const timer = carouselTimersRef.current.get(id);
    if (timer) 
        clearTimeout(timer);

    carouselTimersRef.current.delete(id);
  }

  // send img's alt text/visibility changes to server
  async function flushCarouselSettings(id: string) {
    cancelCarouselTimer(id);

    // skip save if is already saving or has no waiting edits
    if (carouselSavingRef.current.has(id)) 
      return;
    const patch = carouselPendingRef.current.get(id);
    if (!patch) 
      return;

    // take edits out of waiting list & mark img as saving so another save waits
    carouselPendingRef.current.delete(id);
    carouselSavingRef.current.add(id);

    // show img as saving, clear old save error & track whether request succeeds
    setCarouselSaveStates((previous) => ({ ...previous, [id]: "saving" }));
    setCarouselSaveErrors((previous) => ({ ...previous, [id]: "" }));
    let succeeded = false;

    try {
      await requestCarousel("PATCH", { action: "update-image", id, ...patch }, "Couldn't save carousel settings.");
      succeeded = true;

      // don't restore a status/error for removed img while saving
      if (carouselImagesRef.current.some((image) => image.id === id)) {
        setCarouselSaveErrors((previous) => ({ ...previous, [id]: "" }));
        if (!carouselPendingRef.current.has(id))
          setCarouselSaveStates((previous) => ({ ...previous, [id]: "saved" }));
      }

    } catch (error) {
      if (carouselImagesRef.current.some((image) => image.id === id)) {
        // keep failed edits for retry
        carouselPendingRef.current.set(id, { ...patch, ...carouselPendingRef.current.get(id) });
        setCarouselSaveStates((previous) => ({ ...previous, [id]: "error" }));
        setCarouselSaveErrors((previous) => ({ ...previous, [id]: error instanceof Error ? error.message : "Couldn't save carousel settings." }));
      }
    } finally {
      carouselSavingRef.current.delete(id);
      // edits made during this request get their own save after it succeeds
      if (succeeded && carouselPendingRef.current.has(id)) 
        void flushCarouselSettings(id);
    }
  }

  // wait after typing, save toggles/uploads immediately
  function queueCarouselSettings(id: string, patch: CarouselSettings, immediate: boolean) {
    // combine waiting edits with the new ones; newer vals replace older ones
    carouselPendingRef.current.set(id, { ...carouselPendingRef.current.get(id), ...patch });
    setCarouselSaveStates((previous) => ({ ...previous, [id]: "saving" }));
    setCarouselSaveErrors((previous) => ({ ...previous, [id]: "" }));
    cancelCarouselTimer(id);

    if (immediate) 
      void flushCarouselSettings(id);
    else 
      carouselTimersRef.current.set(id, setTimeout(() => { void flushCarouselSettings(id); }, 600));
  }

  // when leaving alt text field or clicking retry for failed settings
  function flushAllCarouselSettings() {
    for (const id of carouselPendingRef.current.keys()) 
      void flushCarouselSettings(id);
  }

  // stop delayed saves when leaving page
  useEffect(() => {
    const timers = carouselTimersRef.current;
    return () => { for (const timer of timers.values()) clearTimeout(timer); };
  }, []);

  // load saved imgs & ask server to add original imgs if not initialized
  useEffect(() => {
    let active = true;

    // start loading with editing disabled & clear any previous loading error before trying again
    async function loadCarouselImages() {
      setCarouselReady(false);
      setCarouselLoadError("");
      try {
        const result = await requestCarousel("PATCH", { action: "initialize-defaults" }, "Couldn't load carousel images.");

        // stop with an error if the server didn't return a list of imgs
        if (!result || !Array.isArray(result.images)) 
          throw new Error("Couldn't load carousel images.");

        if (active) {
          carouselImagesRef.current = result.images;
          setCarouselImages(result.images);
          setCarouselReady(true);
        }

      } catch (error) {
        if (active) 
          setCarouselLoadError(error instanceof Error ? error.message : "Couldn't load carousel images.");
      }
    }

    // start loading without waiting
    void loadCarouselImages();

    // ignore late responses if page closes/newer load attempt starts
    return () => { active = false; };
  }, [carouselLoadAttempt]);

  // adds an empty item --only gets stored in database after uploading an img
  function addCarouselImage() {
    const image: CarouselImage = { id: crypto.randomUUID(), src: "", alt: "", enabled: true };
    carouselImagesRef.current = [...carouselImagesRef.current, image];
    setCarouselImages(carouselImagesRef.current);
  }

  // change item & save its settings if it has an uploaded/original img
  function updateCarouselImage(id: string, patch: Partial<CarouselImage>) {
    // find the img by id, merge changes & redraw item; empty items don't save settings yet
    const current = carouselImagesRef.current.find((image) => image.id === id);
    if (!current) 
      return;
    const updated = { ...current, ...patch };
    carouselImagesRef.current = carouselImagesRef.current.map((image) => image.id === id ? updated : image);
    setCarouselImages(carouselImagesRef.current);
    if (!updated.src) 
      return;

    // a new upload saves both fields under the server's id --other edits save only changed fields
    const settings: CarouselSettings = {};
    if (patch.src !== undefined || patch.id !== undefined) {
      settings.alt = updated.alt;
      settings.enabled = updated.enabled;
    } else {
      if (patch.alt !== undefined) 
        settings.alt = patch.alt;
      if (patch.enabled !== undefined) 
        settings.enabled = patch.enabled;
    }

    // only queue save if settings changed, save immediately for visibility changes & uploaded imgs
    if (Object.keys(settings).length > 0)
      queueCarouselSettings(updated.id, settings, patch.enabled !== undefined || patch.src !== undefined);
  }

  // remove img's entry from list of statuses/errors
  function withoutImage<T>(entries: Record<string, T>, id: string) {
    const next = { ...entries };
    delete next[id];
    return next;
  }

  // clear item & its saves
  function removeCarouselImage(id: string) {
    cancelCarouselTimer(id);
    carouselPendingRef.current.delete(id);
    carouselImagesRef.current = carouselImagesRef.current.filter((image) => image.id !== id);
    setCarouselImages(carouselImagesRef.current);
    setCarouselSaveStates((previous) => withoutImage(previous, id));
    setCarouselSaveErrors((previous) => withoutImage(previous, id));
    setCarouselFileStates((previous) => withoutImage(previous, id));
    setImageErrors((previous) => withoutImage(previous, id));
  }

  // handles shared progress/errors
  async function runCarouselFileAction(id: string, removing: boolean, action: () => Promise<string>) {
    // ignore another upload/removal if another is already running for img
    if (carouselFileBusyRef.current.has(id)) 
      return;

    // lock img against another file action, show uploading/removing progress & clear its old file error
    carouselFileBusyRef.current.add(id);
    const setBusy = removing ? setDeleting : setUploading;
    setBusy((previous) => ({ ...previous, [id]: true }));
    setCarouselFileStates((previous) => ({ ...previous, [id]: "saving" }));
    setImageErrors((previous) => ({ ...previous, [id]: "" }));

    try {
      // new uploads can get a new id; a removal keeps old id for saved messages
      const savedId = await action();
      setCarouselFileStates((previous) => ({ ...withoutImage(previous, id), [savedId]: "saved" }));
    } catch (error) {
      setCarouselFileStates((previous) => ({ ...previous, [id]: "error" }));
      setImageErrors((previous) => ({ ...previous, [id]: error instanceof Error ? error.message : "Couldn't update the image." }));
    } finally {
      // allow another attempt even if request failed
      carouselFileBusyRef.current.delete(id);
      setBusy((previous) => ({ ...previous, [id]: false }));
    }
  }

  // check file before sending it, server checks it before storing it
  async function handleImageFile(id: string, file: File | undefined) {
    // stop if no file is selected or img is already uploading/removing
    if (!file || carouselFileBusyRef.current.has(id)) 
      return;

    // check file's type & size, reject unsupported/empty files & show error without uploading
    const check = isValidImageFile(file);
    let fileError = check.valid ? "" : (check.error ?? "Invalid image file");

    if (!fileError && !["image/png", "image/jpeg", "image/webp"].includes(file.type))
      fileError = "Upload a PNG, JPG, or WebP image.";
    if (!fileError && file.size === 0) 
      fileError = "The image file is empty.";
    if (fileError) {
      setImageErrors((previous) => ({ ...previous, [id]: fileError }));
      setCarouselFileStates((previous) => ({ ...previous, [id]: "error" }));
      return;
    }

    // find item the file belongs to, stop if item no longer exists
    const image = carouselImagesRef.current.find((entry) => entry.id === id);
    if (!image) 
      return;

    await runCarouselFileAction(id, false, async () => {
      // FormData carries file & text together in single upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", image.alt);

      // existing img's id tells server to replace it instead of adding a new item
      if (image.src) 
        formData.append("id", image.id);

      // upload the file & check that the reply includes url, stored file name & img id before changing preview
      const result = await requestCarousel("POST", formData, "Couldn't upload the image.");
      if (typeof result?.url !== "string" || !result.url || typeof result.key !== "string" || !result.key || typeof result.image?.id !== "string" || !result.image.id) 
        throw new Error("The server returned an unexpected response. Check the saved carousel before uploading again.");
      
      // replace preview after server confirms file is saved
      updateCarouselImage(id, { id: result.image.id, src: result.url });
      return result.image.id;
    });
  }

  // keep saved imgs visible until server confirms its removal
  async function handleRemoveImage(id: string) {
    // don't remove img while an upload/removal is running for it
    if (carouselFileBusyRef.current.has(id)) 
      return;

    // find the img being removed; stop if it's already gone from the list
    const image = carouselImagesRef.current.find((entry) => entry.id === id);
    if (!image) 
      return;
    
    // an empty item has no saved file: remove it from page without server request
    if (!image.src) {
      removeCarouselImage(id);
      return;
    }

    // the server removes item & queues unused uploaded files for cleanup
    await runCarouselFileAction(id, true, async () => {
      await requestCarousel("DELETE", { id }, "Couldn't confirm image removal. Please try again.");
      removeCarouselImage(id);
      return id;
    });
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
      return true;
    } catch {
      setErrorMessage("Failed to add the social link.");
      return false;
    }
  }

  function updateSocialLink(id: string, patch: Partial<SocialLink>) {
    try {
      const updatedLinks = content.socialLinks.map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      );
      setContent((prev) => ({ ...prev, socialLinks: updatedLinks }));

      const { valid } = validateSocialLinks(updatedLinks);
      if (valid) {
        setErrorMessage("");
        if (saveStatus === "error") setSaveStatus("idle");
        if (patch.enabled !== undefined) {
          flushPatch({ socialLinks: updatedLinks });
        } else {
          queuePatch({ socialLinks: updatedLinks }, 600);
        }
      } else {
        delete pendingPatchRef.current.socialLinks;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
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
      return true;
    } catch {
      setErrorMessage("Failed to add the holiday.");
      return false;
    }
  }

  function updateHoliday(id: string, patch: Partial<Holiday>) {
    try {
      const updatedHolidays = content.holidays.map((holiday) =>
        holiday.id === id ? { ...holiday, ...patch } : holiday,
      );
      setContent((prev) => ({ ...prev, holidays: updatedHolidays }));

      const { valid } = validateHolidays(updatedHolidays);
      if (valid) {
        setErrorMessage("");
        if (saveStatus === "error") setSaveStatus("idle");
        if (patch.closed !== undefined) {
          flushPatch({ holidays: updatedHolidays });
        } else {
          queuePatch({ holidays: updatedHolidays }, 600);
        }
      } else {
        delete pendingPatchRef.current.holidays;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
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

<<<<<<< HEAD
  // handle save status for carousel --shows an error even when other sections are successful
  let sharedSaveStatus: SaveStatus = "idle";
  if (saveStatus === "error" || carouselSaveStatus === "error") 
    sharedSaveStatus = "error";
  else if (saveStatus === "saving" || carouselSaveStatus === "saving") 
    sharedSaveStatus = "saving";
  else if (saveStatus === "saved" || carouselSaveStatus === "saved") 
    sharedSaveStatus = "saved";
=======
  function updateOnlineOrderingEnabled(enabled: boolean) {
    setErrorMessage("");
    try {
      setContent((prev) => ({ ...prev, onlineOrderingEnabled: enabled }));
      flushPatch({ onlineOrderingEnabled: enabled });
      return true;
    } catch {
      setErrorMessage("Failed to update the online ordering setting.");
      return false;
    }
  }
>>>>>>> origin/dev

  return {
    content: { ...content, carouselImages },
    saveStatus: sharedSaveStatus,
    errorMessage,
    setErrorMessage,
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
    addCarouselImage,
    updateCarouselImage,
    removeCarouselImage,
    carousel: {
      carouselImages,
      carouselReady,
      carouselLoadError,
      retryLoading: () => setCarouselLoadAttempt((attempt) => attempt + 1),
      carouselHasError,
      carouselSaveErrors,
      flushAllCarouselSettings,
      addCarouselImage,
      updateCarouselImage,
      handleImageFile,
      handleRemoveImage,
      uploading,
      deleting,
      imageErrors,
    },
    updateContactFormEnabled,
    updateOnlineOrderingEnabled,
  };
}
