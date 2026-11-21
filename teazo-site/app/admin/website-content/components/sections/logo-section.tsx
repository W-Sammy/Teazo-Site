"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconLogo } from "../icons";
import { Logo, ErrorText } from "../field-controls";
import { isValidLogoFile } from "../validators";

export default function LogoSection({
  logo,
  isOpen,
  onToggle,
  setRef,
  onLogoChange,
}: {
  logo: string;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onLogoChange: (url: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const uploadBlocked = isUploading || requiresReload;

  async function handleFile(file: File | undefined) {
    if (!file || uploadBlocked) return;

    const check = isValidLogoFile(file);
    if (!check.valid) {
      setError(check.error ?? "Invalid image file");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/website-content/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setRequiresReload(payload.requiresReload === true ||
          (res.status >= 500 && payload.requiresReload !== false));
        setError(typeof payload.error === "string" ? payload.error : "Failed to upload logo.");
        return;
      }

      const data = await res.json();
      if (typeof data?.url === "string" && data.url) {
        onLogoChange(data.url);
        setError(null);
      } else {
        setRequiresReload(true);
        setError("The server returned an unexpected response. Check the saved logo before uploading again.");
      }
    } catch {
      setRequiresReload(true);
      setError("The logo save could not be confirmed. Reload this page to check the saved logo before uploading again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <AccordionItem
      id="logo"
      label="Website Logo"
      icon={<IconLogo />}
      isOpen={isOpen}
      onToggle={onToggle}
      setRef={setRef}
    >
      <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
        <label
          htmlFor="website-logo-upload"
          title={isUploading ? "Uploading logo..." : "Change logo"}
          className={`group relative flex h-24 w-24 max-w-full shrink-0 items-center justify-center rounded-2xl border border-[#ecdfd7] bg-[#fbf3ea] p-2 ${
            isUploading ? "cursor-wait opacity-70" : "cursor-pointer"
          }`}
          aria-busy={isUploading}
        >
          <Logo src={logo} />

          <span
            className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-xs font-semibold text-white transition-opacity ${
              isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {isUploading ? "Uploading..." : "Edit"}
          </span>

          <input
            id="website-logo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadBlocked}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>

        <div className="flex min-w-0 flex-col items-start gap-2.5">
          <p className="text-xs text-gray-400">
            Shown in header and banner areas across the site. Browser tab favicon is a static asset.
          </p>
          <p className="text-xs text-gray-400">PNG, JPEG, or WebP, up to 4 MiB.</p>

          <label
            htmlFor="website-logo-upload"
            className={`inline-flex min-h-11 max-w-full items-center justify-center rounded-full border border-[#dbb082] px-4 py-1.5 text-center text-xs font-semibold text-[#a5652b] transition-colors sm:min-h-0 ${
              uploadBlocked
                ? "cursor-wait opacity-50 pointer-events-none"
                : "cursor-pointer hover:bg-[#fbf3ea]"
            }`}
            aria-disabled={uploadBlocked}
          >
            {isUploading ? "Uploading..." : "Change logo"}
          </label>

          {error && <ErrorText>{error}</ErrorText>}
          {requiresReload && (
            <button type="button" onClick={() => window.location.reload()} className="text-xs font-semibold text-[#a5652b] underline">
              Reload saved logo
            </button>
          )}
        </div>
      </div>
    </AccordionItem>
  );
}
