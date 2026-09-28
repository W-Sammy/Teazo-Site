"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconLogo } from "../icons";
import { Logo, ErrorText } from "../field-controls";
import { isValidImageFile } from "../validators";

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
  onLogoChange: (dataUrl: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    const check = isValidImageFile(file);
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
        throw new Error(payload.error || "Failed to upload logo.");
      }

      const data = await res.json();
      if (data.url) {
        onLogoChange(data.url);
        setIsUploading(false);
        return;
      }
    } catch {
      // Fall back to data URL for offline / local testing
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onLogoChange(reader.result);
        }
      };
      reader.readAsDataURL(file);
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
          title="Change logo"
          className="group relative flex h-24 w-24 max-w-full shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[#ecdfd7] bg-[#fbf3ea] p-2"
        >
          <Logo src={logo} />

          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            Edit
          </span>

          {/* visually hidden; the styled label above is the actual click target that opens the file picker */}
          <input
            id="website-logo-upload"
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        <div className="flex min-w-0 flex-col items-start gap-2.5">
          <p className="text-xs text-gray-400">
            Shown in the site header and browser tab favicon.
          </p>

          <label
            htmlFor="website-logo-upload"
            className="inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center rounded-full border border-[#dbb082] px-4 py-1.5 text-center text-xs font-semibold text-[#a5652b] transition-colors hover:bg-[#fbf3ea] sm:min-h-0"
          >
            Change logo
          </label>

          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </div>
    </AccordionItem>
  );
} 