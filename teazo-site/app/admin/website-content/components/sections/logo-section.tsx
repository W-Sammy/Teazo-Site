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

  function handleFile(file: File | undefined) {
    if (!file) return;

    const check = isValidImageFile(file);
    if (!check.valid) {
      setError(check.error ?? "Invalid image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setError(null);
        onLogoChange(reader.result);
      }
    };
    reader.onerror = () => setError("Couldn't read that image file");
    reader.readAsDataURL(file);
  }

  return (
    <AccordionItem id="logo" label="Website Logo" icon={<IconLogo />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <div className="flex items-center gap-5">
        <label
          htmlFor="website-logo-upload"
          title="Change logo"
          className="group relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[#ecdfd7] bg-[#fbf3ea]"
        >
          <Logo src={logo} />
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            Edit
          </span>
          <input
            id="website-logo-upload"
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-xs text-gray-400">Shown in the site header and browser tab favicon.</p>
          <label
            htmlFor="website-logo-upload"
            className="cursor-pointer rounded-full border border-[#dbb082] px-4 py-1.5 text-xs font-semibold text-[#a5652b] transition-colors hover:bg-[#fbf3ea]"
          >
            Change logo
          </label>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </div>
    </AccordionItem>
  );
}
