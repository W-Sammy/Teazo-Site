"use client";

import React from "react";

export default function CartDrawerSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading shopping bag contents"
      className="flex-1 overflow-y-auto px-6 py-4 space-y-6 animate-pulse"
    >
      {/* Items list placeholder */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-3 w-28 bg-stone-200 rounded-md" />
          <div className="h-3 w-16 bg-stone-100 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 py-3 border-b border-gray-100 items-center">
              <div className="w-14 h-14 bg-stone-200 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-stone-200 rounded-md" />
                <div className="h-3 w-1/2 bg-stone-100 rounded-md" />
              </div>
              <div className="h-8 w-16 bg-stone-100 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Pickup scheduling card placeholder */}
      <div className="p-4 rounded-2xl bg-stone-50 border border-stone-100 space-y-3">
        <div className="h-3.5 w-32 bg-stone-200 rounded-md" />
        <div className="h-9 w-full bg-stone-200/60 rounded-xl" />
      </div>

      {/* Contact details card placeholder */}
      <div className="p-4 rounded-2xl bg-stone-50 border border-stone-100 space-y-3">
        <div className="h-3.5 w-36 bg-stone-200 rounded-md" />
        <div className="space-y-2">
          <div className="h-9 w-full bg-stone-200/60 rounded-xl" />
          <div className="h-9 w-full bg-stone-200/60 rounded-xl" />
          <div className="h-9 w-full bg-stone-200/60 rounded-xl" />
        </div>
      </div>

      {/* Checkout footer placeholder */}
      <div className="pt-4 border-t border-gray-100 space-y-3">
        <div className="flex justify-between">
          <div className="h-4 w-24 bg-stone-200 rounded-md" />
          <div className="h-4 w-16 bg-stone-200 rounded-md" />
        </div>
        <div className="h-12 w-full bg-stone-200 rounded-xl" />
      </div>
    </div>
  );
}
