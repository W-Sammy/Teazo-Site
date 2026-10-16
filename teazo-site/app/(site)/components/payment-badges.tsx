import React from "react";

/**
 * PaymentBadges renders visual indicators of the accepted payment methods
 * supported by TEAZO via Square Hosted Checkout.
 */
export default function PaymentBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase">
        Accepted Payment Methods
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {/* Apple Pay */}
        <div
          role="img"
          aria-label="Apple Pay"
          title="Apple Pay"
          className="flex items-center justify-center h-7 px-2.5 rounded bg-black text-white text-[11px] font-semibold tracking-tight shadow-sm select-none"
        >
          <svg
            className="w-3 h-3.5 fill-current mr-1 inline-block"
            viewBox="0 0 170 170"
            aria-hidden="true"
          >
            <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.7-11.64-13.98-5.87-9.04-10.45-19.78-13.73-32.23-3.28-12.45-4.92-24.16-4.92-35.13 0-16.7 4.12-30.56 12.36-41.57 8.24-11.01 18.77-16.63 31.6-16.85 4.9.11 10.12 1.34 15.66 3.69 5.54 2.34 9.38 3.55 11.52 3.64 1.83-.09 5.92-1.39 12.27-3.91 6.35-2.52 11.75-3.64 16.2-3.35 15.06 1.08 26.54 6.75 34.42 17.02-13.43 8.16-20.02 19.34-19.78 33.53.25 11.19 4.49 20.66 12.71 28.4 4.02 3.8 8.65 6.69 13.89 8.66-2.61 7.62-5.71 15.22-9.31 22.8zM119.22 31.84c-.11-7.1 2.47-13.88 7.74-20.35 5.27-6.47 11.83-10.66 19.68-12.57.22 7.32-2.39 14.16-7.83 20.52-5.44 6.36-12.06 10.49-19.59 12.4z" />
          </svg>
          <span>Pay</span>
        </div>

        {/* Google Pay */}
        <div
          role="img"
          aria-label="Google Pay"
          title="Google Pay"
          className="flex items-center justify-center h-7 px-2.5 rounded bg-white border border-gray-200 text-gray-700 text-[11px] font-semibold tracking-tight shadow-sm select-none"
        >
          <span aria-hidden="true">
            <span className="text-[#4285F4] font-bold">G</span>
            <span className="text-[#EA4335] font-bold">o</span>
            <span className="text-[#FBBC05] font-bold">o</span>
            <span className="text-[#4285F4] font-bold">g</span>
            <span className="text-[#34A853] font-bold">l</span>
            <span className="text-[#EA4335] font-bold mr-1">e</span>
          </span>
          <span className="text-gray-700">Pay</span>
        </div>

        {/* Cash App Pay */}
        <div
          role="img"
          aria-label="Cash App Pay"
          title="Cash App Pay"
          className="flex items-center justify-center h-7 px-2.5 rounded bg-[#00D632] text-white text-[11px] font-bold tracking-tight shadow-sm select-none"
        >
          $ Cash App
        </div>

        {/* Visa */}
        <div
          role="img"
          aria-label="Visa"
          title="Visa"
          className="flex items-center justify-center h-7 px-2.5 rounded bg-white border border-gray-200 text-[#1A1F71] text-[12px] font-black italic tracking-wider shadow-sm select-none"
        >
          VISA
        </div>

        {/* Mastercard */}
        <div
          role="img"
          aria-label="Mastercard"
          title="Mastercard"
          className="flex items-center justify-center h-7 px-2 rounded bg-white border border-gray-200 shadow-sm select-none"
        >
          <div className="flex items-center -space-x-1.5" aria-hidden="true">
            <div className="w-3.5 h-3.5 rounded-full bg-[#EB001B] opacity-90" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#F79E1B] opacity-90" />
          </div>
        </div>

        {/* Amex */}
        <div
          role="img"
          aria-label="American Express"
          title="American Express"
          className="flex items-center justify-center h-7 px-2 rounded bg-[#006FCF] text-white text-[10px] font-bold tracking-wider shadow-sm select-none"
        >
          AMEX
        </div>
      </div>
    </div>
  );
}
