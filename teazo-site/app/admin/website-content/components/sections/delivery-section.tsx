"use client";

import { useState } from "react";
import { AccordionItem } from "../section-shell";
import { IconDelivery } from "../icons";
import { fieldClass, ErrorText } from "../field-controls";
import type { SocialLink } from "@/app/types/website-content";
import { isValidUrlOrEmail } from "../validators";

// delivery links use the same name/url/visibility fields as social links
type FieldTouch = { label?: boolean; url?: boolean };

export default function DeliverySection({
    deliveryLinks,
    isOpen,
    onToggle,
    setRef,
    onUpdateLink,
    onAddLink,
    onRemoveLink,
    onBlur,
}: {
    deliveryLinks: SocialLink[];
    isOpen: boolean;
    onToggle: () => void;
    setRef: (el: HTMLDivElement | null) => void;
    onUpdateLink: (id: string, patch: Partial<SocialLink>) => void;
    onAddLink: () => void;
    onRemoveLink: (id: string) => void;
    onBlur?: () => void;
}) {
    // remember which fields were used so new blank rows don't show errors immediately
    const [touched, setTouched] = useState<Record<string, FieldTouch>>({});

    function markTouched(id: string, field: keyof FieldTouch) {
        setTouched((previous) => ({ ...previous, [id]: { ...previous[id], [field]: true } }));
        onBlur?.();
    }

    function fieldErrors(link: SocialLink) {
        const fields = touched[link.id] ?? {};
        const hasName = Boolean(link.label.trim());
        const hasUrl = Boolean(link.url.trim());
        const labelError = fields.label && !hasName && hasUrl ? "A platform name is required" : "";
        let urlError = "";
        if (fields.url) {
            if (!hasUrl && hasName) 
                urlError = "A link is required*";
            else if (hasUrl && (!/^https?:\/\//i.test(link.url.trim()) || !isValidUrlOrEmail(link.url))) 
                urlError = "Please enter a valid http:// or https:// link";
        }
        return { labelError, urlError };
    }

    return (
        <AccordionItem id="delivery" label="Delivery" icon={<IconDelivery />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
            <p className="mb-1 text-xs text-gray-400">
                Links shown as buttons on the delivery page.
            </p>

            {deliveryLinks.length === 0 && (
                <p className="py-4 text-sm text-[#a99584]">No delivery links yet. Add one to get started!</p>
            )}

            <div className="flex min-w-0 flex-col divide-y divide-[#f3ece4]">
                {deliveryLinks.map((link) => {
                    const { labelError, urlError } = fieldErrors(link);
                    const errorId = `delivery-error-${link.id}`;
                    return (
                        <div key={link.id} className="flex min-w-0 flex-col gap-1.5 py-3.5 first:pt-3 last:pb-0">
                            {/* stack items on mobile; use a row on desktop like the social section */}
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[120px_minmax(0,1fr)_auto] lg:gap-4">
                                <input
                                    type="text"
                                    value={link.label}
                                    maxLength={16}
                                    placeholder="Platform"
                                    aria-label="Delivery platform name"
                                    aria-invalid={Boolean(labelError)}
                                    aria-describedby={labelError ? errorId : undefined}
                                    onChange={(event) => onUpdateLink(link.id, { label: event.target.value })}
                                    onBlur={() => markTouched(link.id, "label")}
                                    className={`${fieldClass(Boolean(labelError))} col-start-1 row-start-1 font-semibold text-[#4a3418]`}
                                />
                                <input
                                    type="url"
                                    value={link.url}
                                    maxLength={2048}
                                    placeholder={link.label ? `${link.label} link` : "Delivery link"}
                                    aria-label={link.label ? `${link.label} delivery link` : "Delivery platform link"}
                                    aria-invalid={Boolean(urlError)}
                                    aria-describedby={urlError ? errorId : undefined}
                                    onChange={(event) => onUpdateLink(link.id, { url: event.target.value })}
                                    onBlur={() => markTouched(link.id, "url")}
                                    className={`${fieldClass(Boolean(urlError))} col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1`}
                                />

                                {/* hiding keeps the item; removing it just removes the item */}
                                <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-start-3 lg:gap-4">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={link.enabled}
                                        aria-label={`Show ${link.label || "delivery platform"} on the delivery page`}
                                        onClick={() => onUpdateLink(link.id, { enabled: !link.enabled })}
                                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
                                    >
                                        <span className={`relative block h-[18px] w-8 rounded-full transition-colors ${link.enabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"}`}>
                                            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${link.enabled ? "left-4" : "left-0.5"}`} />
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${link.label || "delivery platform"}`}
                                        onClick={() => onRemoveLink(link.id)}
                                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2] lg:h-5 lg:w-5"
                                    >
                                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <path d="M5 5l10 10M15 5L5 15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {(labelError || urlError) && (
                                <div id={errorId} className="flex min-w-0 flex-col gap-0.5">
                                    {labelError && <ErrorText>{labelError}</ErrorText>}
                                    {urlError && <ErrorText>{urlError}</ErrorText>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* same pink/hover/disabled colors as the social add button */}
            <button
                type="button"
                onClick={onAddLink}
                className="mt-4 min-h-11 w-full cursor-pointer rounded-2xl bg-[#F59AA3] px-[18px] py-2 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-black disabled:cursor-not-allowed disabled:bg-[#FFBDC7] sm:min-h-0 sm:w-auto"
            >
                New Delivery Link +
            </button>
        </AccordionItem>
    );
}
