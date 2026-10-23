"use client";

import { AccordionItem } from "../section-shell";
import { IconOrdering } from "../icons";
import { FieldLabel } from "../field-controls";

// Lets the owner stop online pickup orders when the shop is too busy or short-staffed.
// The menu stays up; the cart says ordering is paused and checkout refuses new orders.
export default function OrderingSection({
  onlineOrderingEnabled,
  isOpen,
  onToggle,
  setRef,
  onUpdateOnlineOrderingEnabled,
}: {
  onlineOrderingEnabled: boolean;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateOnlineOrderingEnabled: (enabled: boolean) => void;
}) {
  return (
    <AccordionItem id="ordering" label="Online Ordering" icon={<IconOrdering />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <div className="rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FieldLabel>Online Pickup Orders</FieldLabel>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                  onlineOrderingEnabled
                    ? "bg-[#6f8f6a]/15 text-[#3e6837]"
                    : "bg-[#dbb082]/25 text-[#735129]"
                }`}
              >
                {onlineOrderingEnabled ? "Taking orders" : "Paused"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Pause online orders when the shop is too busy or short-staffed. Customers can still browse the menu, but the cart tells them ordering is paused and checkout is turned off. Orders already paid are not affected.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <button
              type="button"
              role="switch"
              aria-checked={onlineOrderingEnabled}
              aria-label={`Online pickup orders (currently ${onlineOrderingEnabled ? "taking orders" : "paused"})`}
              onClick={() => onUpdateOnlineOrderingEnabled(!onlineOrderingEnabled)}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
            >
              <span
                className={`relative block h-[18px] w-8 rounded-full transition-colors ${
                  onlineOrderingEnabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                    onlineOrderingEnabled ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>
    </AccordionItem>
  );
}
