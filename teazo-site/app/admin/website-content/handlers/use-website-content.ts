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
  MAX_SOCIAL_LINKS,
  MAX_HOLIDAYS,
  MAX_DELIVERY_LINKS,
} from "@/app/lib/website-content-validators";

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const UNCERTAIN_SAVE = "The save could not be confirmed. Reload this page to check current content before trying again.";
const UNCERTAIN_DELETE = "The deletion could not be confirmed. Reload this page to check current content before trying again.";

function requireReloadMessage(message: string) {
  return /reload/i.test(message) ? message : `${message} Reload this page before making more changes.`;
}

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
  // Validation may keep local edits out of the save queue. Only a confirmed
  // write changes this snapshot, so incomplete edits and drafts stay dirty.
  const [savedContent, setSavedContent] = useState<WebsiteContent>(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const pendingPatchRef = useRef<Partial<WebsiteContent>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const saveOperationRef = useRef<Promise<boolean> | null>(null);
  const revisionRef = useRef(initialContent.collectionsRevision ?? 0);
  const reconciliationRef = useRef<string | null>(null);
  const deletePendingRef = useRef(false);
  // IDs are not a persistence signal: saved holidays also use "holiday-".
  const draftIdsRef = useRef({ socialLinks: new Set<string>(), holidays: new Set<string>() });
  const savedCollectionsRef = useRef({ socialLinks: initialContent.socialLinks, holidays: initialContent.holidays });
  const [isDeleting, setIsDeleting] = useState(false);

  const flushPatch = async (
    immediatePatch?: Partial<WebsiteContent>,
    validationError?: string,
    options: { forDeletion?: boolean; keepalive?: boolean } = {},
  ): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (immediatePatch) {
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...immediatePatch,
        ...(immediatePatch.address ? { address: {
          ...pendingPatchRef.current.address, ...immediatePatch.address,
        } } : {}),
      };
    }
    // Blur/debounce saves must not race the DELETE after its queue is drained.
    if (deletePendingRef.current && !options.forDeletion) return false;
    if (validationError || reconciliationRef.current) {
      setSaveStatus("error");
      setErrorMessage(reconciliationRef.current || validationError!);
      return false;
    }
    if (saveOperationRef.current) return saveOperationRef.current;
    if (Object.keys(pendingPatchRef.current).length === 0) return true;

    isSavingRef.current = true;
    const operation = (async () => {
      try {
        while (Object.keys(pendingPatchRef.current).length > 0) {
          const validation = validateWebsiteContentPatch(pendingPatchRef.current);
          if (!validation.valid) throw new Error(validation.errors[0]);
          const payload = { ...pendingPatchRef.current };
          pendingPatchRef.current = {};
          setSaveStatus("saving");
          let responseReceived = false;
          try {
            const changesCollections = payload.socialLinks !== undefined || payload.holidays !== undefined;
            // Once submitted, a draft might have committed even if the response
            // is lost. Its removal must follow the persisted-entry path.
            payload.socialLinks?.filter((entry) => entry.url).forEach((entry) => draftIdsRef.current.socialLinks.delete(entry.id));
            payload.holidays?.filter((entry) => entry.date).forEach((entry) => draftIdsRef.current.holidays.delete(entry.id));
            const res = await fetch("/api/website-content", {
              method: "PATCH",
              keepalive: options.keepalive,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload,
                ...(changesCollections ? { collectionsRevision: revisionRef.current } : {}),
              }),
            });
            responseReceived = true;
            const result = await res.json().catch(() => ({}));
            if (!res.ok) {
              if (res.status === 409 || result.requiresReload) {
                reconciliationRef.current = requireReloadMessage(result.error || UNCERTAIN_SAVE);
              }
              throw new Error(result.error || `Server returned ${res.status}`);
            }
            if (changesCollections) {
              if (result.collectionsRevision !== revisionRef.current + 1) {
                reconciliationRef.current = UNCERTAIN_SAVE;
                throw new Error(UNCERTAIN_SAVE);
              }
              revisionRef.current = result.collectionsRevision;
              if (payload.socialLinks) savedCollectionsRef.current.socialLinks = payload.socialLinks;
              if (payload.holidays) savedCollectionsRef.current.holidays = payload.holidays;
            }
            setSavedContent((previous) => ({
              ...previous,
              ...payload,
              address: { ...previous.address, ...payload.address },
            }));
          } catch (error) {
            // A transport failure may hide a committed collection replacement.
            if (!responseReceived) reconciliationRef.current = UNCERTAIN_SAVE;
            // Keep the failed save for an explicit retry; newer edits win.
            pendingPatchRef.current = { ...payload, ...pendingPatchRef.current };
            throw error;
          }
        }
        setSaveStatus("saved");
        setErrorMessage("");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((current) => current === "saved" ? "idle" : current);
        }, 3000);
        return true;
      } catch (error) {
        setSaveStatus("error");
        setErrorMessage(reconciliationRef.current ||
          (error instanceof Error ? error.message : "Failed to save changes. Please try again."));
        return false;
      }
    })();
    saveOperationRef.current = operation;
    try {
      return await operation;
    } finally {
      saveOperationRef.current = null;
      isSavingRef.current = false;
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

    setSaveStatus((current) => current === "saving" ? "saving" : "unsaved");

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
      if (!isSavingRef.current && !deletePendingRef.current && !reconciliationRef.current && Object.keys(pendingPatchRef.current).length > 0) {
        const validation = validateWebsiteContentPatch(pendingPatchRef.current);
        if (validation.valid) {
          // Use the same submission bookkeeping even if navigation is canceled:
          // a submitted draft must never become a local-only discard again.
          void flushPatch(undefined, undefined, { keepalive: true });
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

  function updateLogo(url: string) {
    setErrorMessage("");
    setContent((prev) => ({ ...prev, logo: url }));
    // The upload endpoint has already confirmed persistence before this callback.
    setSavedContent((prev) => ({ ...prev, logo: url }));
    return true;
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

    // an empty item has no saved file, remove it from page without server request
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

  // keep empty new items on screen until refresh or name & link have been entered
  function addDeliveryLink() {
    setErrorMessage("");
    if ((content.deliveryLinks ?? []).length >= MAX_DELIVERY_LINKS) {
      setErrorMessage(`Maximum limit of ${MAX_DELIVERY_LINKS} delivery links reached.`);
      return false;
    }
    const link: SocialLink = {
      id: createTemporaryId("delivery"), label: "", icon: "", url: "", enabled: true,
    };
    setContent((previous) => ({ ...previous, deliveryLinks: [...(previous.deliveryLinks ?? []), link] }));
    return true;
  }

  // show edits immediately, then save complete links
  function saveDeliveryLinks(links: SocialLink[], immediately = false) {
    setContent((previous) => ({ ...previous, deliveryLinks: links }));
    // leave blank items out of the save; keep hidden links in the saved list
    const savedLinks = links.filter((link) => link.label.trim() || link.url.trim());
    const validation = validateWebsiteContentPatch({ deliveryLinks: savedLinks });
    if (!validation.valid) {
      // discard older waiting delivery save without cancelling other sections' saves
      delete pendingPatchRef.current.deliveryLinks;
      setErrorMessage(validation.errors[0]);
      setSaveStatus("error");
      return;
    }
    setErrorMessage("");
    if (saveStatus === "error") setSaveStatus("idle");
    if (immediately) {
      void flushPatch({ deliveryLinks: savedLinks });
    } else {
      queuePatch({ deliveryLinks: savedLinks }, 600);
    }
  }

  // merge the changed field into its platform; visibility switches save right away
  function updateDeliveryLink(id: string, patch: Partial<SocialLink>) {
    const links = (content.deliveryLinks ?? []).map((link) =>
      link.id === id ? { ...link, ...patch } : link,
    );
    saveDeliveryLinks(links, patch.enabled !== undefined);
  }

  // save the remaining asap, including an empty list after the last removal
  function removeDeliveryLink(id: string) {
    saveDeliveryLinks((content.deliveryLinks ?? []).filter((link) => link.id !== id), true);
  }

  function addSocialLink() {
    setErrorMessage("");
    try {
      if (content.socialLinks.length >= MAX_SOCIAL_LINKS) {
        setErrorMessage(`Maximum limit of ${MAX_SOCIAL_LINKS} social links reached.`);
        return false;
      }
      const id = createTemporaryId("social");
      draftIdsRef.current.socialLinks.add(id);
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

  async function removeEntry(collection: "socialLinks" | "holidays", id: string): Promise<string | null> {
    if (deletePendingRef.current) return "A deletion is already in progress.";
    if (draftIdsRef.current[collection].has(id)) {
      draftIdsRef.current[collection].delete(id);
      // Remove queued copies too, so debounce/unload cannot save a discarded draft.
      if (collection === "socialLinks" && pendingPatchRef.current.socialLinks) {
        const remaining = pendingPatchRef.current.socialLinks.filter((entry) => entry.id !== id);
        if (JSON.stringify(remaining) === JSON.stringify(savedCollectionsRef.current.socialLinks)) {
          delete pendingPatchRef.current.socialLinks;
        } else pendingPatchRef.current.socialLinks = remaining;
      }
      if (collection === "holidays" && pendingPatchRef.current.holidays) {
        const remaining = pendingPatchRef.current.holidays.filter((entry) => entry.id !== id);
        if (JSON.stringify(remaining) === JSON.stringify(savedCollectionsRef.current.holidays)) {
          delete pendingPatchRef.current.holidays;
        } else pendingPatchRef.current.holidays = remaining;
      }
      setContent((previous) => ({ ...previous,
        ...(collection === "socialLinks"
          ? { socialLinks: previous.socialLinks.filter((entry) => entry.id !== id) }
          : { holidays: previous.holidays.filter((entry) => entry.id !== id) }),
      }));
      setErrorMessage("");
      return null;
    }
    deletePendingRef.current = true;
    setIsDeleting(true);
    let deletionConfirmed = false;
    try {
      // Finish earlier saves before claiming the revision for this deletion.
      if (!await flushPatch(undefined, undefined, { forDeletion: true })) return "Save pending changes successfully before deleting, or reload this page.";
      // Client IDs stay stable while dates are edited. Resolve the storage key
      // from the latest confirmed payload, after any in-flight save finishes.
      const savedEntry = savedCollectionsRef.current[collection].find((entry) => entry.id === id);
      if (!savedEntry) {
        reconciliationRef.current = "The saved entry could not be found. Reload this page before making more changes.";
        return reconciliationRef.current;
      }
      const persistedId = "date" in savedEntry ? savedEntry.date : savedEntry.id;
      const response = await fetch("/api/website-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, id: persistedId, revision: revisionRef.current }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404 || response.status === 409 || result.requiresReload) {
          reconciliationRef.current = requireReloadMessage(result.error || UNCERTAIN_DELETE);
          return reconciliationRef.current;
        }
        return result.error || "The entry could not be deleted. Please try again.";
      }
      if (result.collectionsRevision !== revisionRef.current + 1) {
        reconciliationRef.current = UNCERTAIN_DELETE;
        return reconciliationRef.current;
      }
      revisionRef.current = result.collectionsRevision;
      if (collection === "socialLinks") {
        savedCollectionsRef.current.socialLinks = savedCollectionsRef.current.socialLinks.filter((entry) => entry.id !== id);
        if (pendingPatchRef.current.socialLinks) pendingPatchRef.current.socialLinks = pendingPatchRef.current.socialLinks.filter((entry) => entry.id !== id);
      } else {
        savedCollectionsRef.current.holidays = savedCollectionsRef.current.holidays.filter((entry) => entry.id !== id);
        if (pendingPatchRef.current.holidays) pendingPatchRef.current.holidays = pendingPatchRef.current.holidays.filter((entry) => entry.id !== id);
      }
      setContent((previous) => ({ ...previous,
        collectionsRevision: result.collectionsRevision,
        ...(collection === "socialLinks"
          ? { socialLinks: previous.socialLinks.filter((entry) => entry.id !== id) }
          : { holidays: previous.holidays.filter((entry) => entry.id !== id) }),
      }));
      setSavedContent((previous) => ({ ...previous,
        collectionsRevision: result.collectionsRevision,
        ...(collection === "socialLinks"
          ? { socialLinks: previous.socialLinks.filter((entry) => entry.id !== id) }
          : { holidays: previous.holidays.filter((entry) => entry.id !== id) }),
      }));
      setErrorMessage("");
      deletionConfirmed = true;
      return null;
    } catch {
      reconciliationRef.current = UNCERTAIN_DELETE;
      return reconciliationRef.current;
    } finally {
      deletePendingRef.current = false;
      setIsDeleting(false);
      if (deletionConfirmed && Object.keys(pendingPatchRef.current).length > 0) void flushPatch();
    }
  }

  function removeSocialLink(id: string) {
    return removeEntry("socialLinks", id);
  }

  function addHoliday() {
    setErrorMessage("");
    try {
      if (content.holidays.length >= MAX_HOLIDAYS) {
        setErrorMessage(`Maximum limit of ${MAX_HOLIDAYS} holiday exceptions reached.`);
        return false;
      }
      const id = createTemporaryId("holiday");
      draftIdsRef.current.holidays.add(id);
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
    return removeEntry("holidays", id);
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

  const editableFields = [
    "logo", "story", "address", "hours", "socialLinks", "deliveryLinks",
    "holidays", "contactFormEnabled", "onlineOrderingEnabled",
  ] as const;
  const hasLocalEdits = editableFields.some((field) =>
    JSON.stringify(content[field]) !== JSON.stringify(savedContent[field]));
  const hasUnsavedEdits = hasLocalEdits ||
    Object.keys(pendingPatchRef.current).length > 0 || isSavingRef.current ||
    carouselHasSaving || carouselHasAnyError ||
    carouselImages.some((image) => !image.src);

  // A successful save in one section must not hide incomplete edits elsewhere.
  let sharedSaveStatus: SaveStatus = "idle";
  if (saveStatus === "error" || carouselSaveStatus === "error")
    sharedSaveStatus = "error";
  else if (saveStatus === "saving" || carouselSaveStatus === "saving")
    sharedSaveStatus = "saving";
  else if (hasUnsavedEdits)
    sharedSaveStatus = "unsaved";
  else if (saveStatus === "saved" || carouselSaveStatus === "saved")
    sharedSaveStatus = "saved";

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

  return {
    content: { ...content, carouselImages },
    isDeleting,
    saveStatus: sharedSaveStatus,
    hasUnsavedEdits,
    errorMessage,
    setErrorMessage,
    flushPatch,
    updateLogo,
    updateStory,
    updateAddress,
    updateDay,
    addDeliveryLink,
    updateDeliveryLink,
    removeDeliveryLink,
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
