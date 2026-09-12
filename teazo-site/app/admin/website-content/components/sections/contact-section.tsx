"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconContact } from "../icons";
import { fieldClass, FieldLabel, ErrorText } from "../field-controls";
import { isNonEmpty, isValidEmail, isValidPhone, withinMaxLength } from "../validators";
import type { AddressInfo } from "@/app/types/website-content";

type ContactField = "businessName" | "phone" | "streetAddress" | "locality" | "email";
type ContactErrors = Partial<Record<ContactField, string>>;

function validateField(field: ContactField, value: string): string | undefined {
  switch (field) {
    case "businessName":
      if (!isNonEmpty(value)) return "Business name is required";
      if (!withinMaxLength(value, 100)) return "Keep under 100 characters";
      return undefined;
    case "phone":
      if (!isNonEmpty(value)) return "Phone number is required";
      if (!isValidPhone(value)) return "Enter a valid phone number";
      return undefined;
    case "streetAddress":
      if (!isNonEmpty(value)) return "Street address is required";
      return undefined;
    case "locality":
      if (!isNonEmpty(value)) return "City, state, and ZIP are required";
      return undefined;
    case "email":
      if (!isNonEmpty(value)) return "Email is required";
      if (!isValidEmail(value)) return "Enter a valid email address";
      return undefined;
  }
}

export default function ContactSection({
  address,
  isOpen,
  onToggle,
  setRef,
  onUpdateAddress,
}: {
  address: AddressInfo;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateAddress: (patch: Partial<AddressInfo>) => void;
}) {
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [errors, setErrors] = useState<ContactErrors>({});

  // only revalidates fields already touched (post-blur), so typing into an untouched
  // field doesn't flash an error before the user's had a chance to finish it
  function handleChange(field: ContactField, value: string) {
    onUpdateAddress({ [field]: value } as Partial<AddressInfo>);
    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
    }
  }

  function handleBlur(field: ContactField, value: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
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
              className={fieldClass(Boolean(errors.phone))}
            />
            {errors.phone && <ErrorText>{errors.phone}</ErrorText>}
          </div>
        </div>

        <div className="rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-4">
          <FieldLabel>Address</FieldLabel>
          <div className="flex flex-col gap-2.5">
            <div>
              <input
                type="text"
                value={address.streetAddress}
                onChange={(e) => handleChange("streetAddress", e.target.value)}
                onBlur={(e) => handleBlur("streetAddress", e.target.value)}
                placeholder="Street address"
                className={`${fieldClass(Boolean(errors.streetAddress))} bg-white`}
              />
              {errors.streetAddress && <ErrorText>{errors.streetAddress}</ErrorText>}
            </div>
            <div>
              <input
                type="text"
                value={address.locality}
                onChange={(e) => handleChange("locality", e.target.value)}
                onBlur={(e) => handleBlur("locality", e.target.value)}
                placeholder="City, State ZIP"
                className={`${fieldClass(Boolean(errors.locality))} bg-white`}
              />
              {errors.locality && <ErrorText>{errors.locality}</ErrorText>}
            </div>
          </div>
        </div>

        <div className="sm:w-1/2">
          <FieldLabel>Email</FieldLabel>
          <input
            type="text"
            value={address.email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={(e) => handleBlur("email", e.target.value)}
            className={fieldClass(Boolean(errors.email))}
          />
          {errors.email && <ErrorText>{errors.email}</ErrorText>}
        </div>
      </div>
    </AccordionItem>
  );
}
