"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconContact } from "../icons";
import { fieldClass, FieldLabel, ErrorText } from "../field-controls";
import {
  validateAddressField,
  validateAddress,
  isValidPhone,
  formatPhoneNumber,
} from "../validators";
import type { AddressInfo } from "@/app/types/website-content";

type ContactField = "businessName" | "phone" | "streetAddress" | "locality" | "email" | "mapQuery";
type ContactErrors = Partial<Record<ContactField, string>>;

export default function ContactSection({
  address,
  contactFormEnabled = true,
  isOpen,
  onToggle,
  setRef,
  onUpdateAddress,
  onUpdateContactFormEnabled,
  onBlur,
}: {
  address: AddressInfo;
  contactFormEnabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateAddress: (patch: Partial<AddressInfo>) => void;
  onUpdateContactFormEnabled?: (enabled: boolean) => void;
  onBlur?: (error?: string) => void;
}) {
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [errors, setErrors] = useState<ContactErrors>({});

  // Revalidates fields already touched (post-blur), so typing into an untouched
  // field doesn't flash an error before the user's had a chance to finish it
  function handleChange(field: ContactField, value: string) {
    onUpdateAddress({ [field]: value } as Partial<AddressInfo>);
    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateAddressField(field, value) }));
    }
  }

  function handleBlur(field: ContactField, value: string) {
    let finalValue = value.trim();
    if (field === "phone" && isValidPhone(finalValue)) {
      finalValue = formatPhoneNumber(finalValue);
      if (finalValue !== value) {
        onUpdateAddress({ phone: finalValue });
      }
    }
    const fieldError = validateAddressField(field, finalValue);
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: fieldError }));

    const updatedAddress = { ...address, [field]: finalValue };
    const { valid, errors: addrErrors } = validateAddress(updatedAddress);
    if (!valid) {
      const firstError = fieldError || Object.values(addrErrors)[0];
      onBlur?.(firstError);
    } else {
      onBlur?.();
    }
  }

  return (
    <AccordionItem id="contact" label="Contact Info" icon={<IconContact />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Business Name</FieldLabel>
            <input
              type="text"
              value={address.businessName}
              onChange={(e) => handleChange("businessName", e.target.value)}
              onBlur={(e) => handleBlur("businessName", e.target.value)}
              className={fieldClass(Boolean(errors.businessName))}
            />
            {errors.businessName && <ErrorText>{errors.businessName}</ErrorText>}
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <input
              type="text"
              value={address.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              onBlur={(e) => handleBlur("phone", e.target.value)}
              placeholder="+1 (415) 748-7398"
              className={fieldClass(Boolean(errors.phone))}
            />
            {errors.phone && <ErrorText>{errors.phone}</ErrorText>}
          </div>
        </div>

        <div className="rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-4">
          <FieldLabel>Address</FieldLabel>
          <div className="flex flex-col gap-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-[#8c6d48]">Street Address</span>
              <input
                type="text"
                value={address.streetAddress}
                onChange={(e) => handleChange("streetAddress", e.target.value)}
                onBlur={(e) => handleBlur("streetAddress", e.target.value)}
                placeholder="Street address (e.g. 1050 Taraval St.)"
                className={`${fieldClass(Boolean(errors.streetAddress))} bg-white`}
              />
              {errors.streetAddress && <ErrorText>{errors.streetAddress}</ErrorText>}
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-[#8c6d48]">City, State ZIP</span>
              <input
                type="text"
                value={address.locality}
                onChange={(e) => handleChange("locality", e.target.value)}
                onBlur={(e) => handleBlur("locality", e.target.value)}
                placeholder="City, State ZIP (e.g. San Francisco, CA 94116)"
                className={`${fieldClass(Boolean(errors.locality))} bg-white`}
              />
              {errors.locality && <ErrorText>{errors.locality}</ErrorText>}
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-[#8c6d48]">Google Maps Search Query (optional)</span>
              <input
                type="text"
                value={address.mapQuery ?? ""}
                onChange={(e) => handleChange("mapQuery", e.target.value)}
                onBlur={(e) => handleBlur("mapQuery", e.target.value)}
                placeholder="Google Maps search query (optional, e.g. 1050 Taraval St, San Francisco, CA 94116)"
                className={`${fieldClass(Boolean(errors.mapQuery))} bg-white`}
              />
              {errors.mapQuery && <ErrorText>{errors.mapQuery}</ErrorText>}
            </div>
          </div>
        </div>

        <div className="sm:w-1/2">
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            value={address.email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={(e) => handleBlur("email", e.target.value)}
            placeholder="teazosf@hotmail.com"
            className={fieldClass(Boolean(errors.email))}
          />
          {errors.email && <ErrorText>{errors.email}</ErrorText>}
        </div>

        <div className="rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FieldLabel>Contact Us Form</FieldLabel>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                    contactFormEnabled
                      ? "bg-[#6f8f6a]/15 text-[#3e6837]"
                      : "bg-[#dbb082]/25 text-[#735129]"
                  }`}
                >
                  {contactFormEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Display the Contact Us form on the customer-facing Contact page. Disable this toggle if the form starts receiving spam.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              <button
                type="button"
                role="switch"
                aria-checked={contactFormEnabled}
                aria-label={`Toggle Contact Us form (currently ${
                  contactFormEnabled ? "enabled" : "disabled"
                })`}
                onClick={() =>
                  onUpdateContactFormEnabled?.(!contactFormEnabled)
                }
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
              >
                <span
                  className={`relative block h-[18px] w-8 rounded-full transition-colors ${
                    contactFormEnabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      contactFormEnabled ? "left-4" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AccordionItem>
  );
}
