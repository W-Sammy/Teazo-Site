"use client";

import { useSearchParams } from "next/navigation";
import { Montserrat } from "next/font/google";

// medium montserrat
const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['500']
});

const messages: Record<string, string> = {
  AccessDenied:
    "This Google account does not have admin access. Contact the site owner.",
  ServiceUnavailable:
    "We could not verify your access. Please try again shortly.",
};

export default function AuthMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  if (!error) return null;

  return (
    <p role="alert" className={`${montserrat.className} mb-4 text-center text-sm text-red-600`}>
      {messages[error] ?? "Sign-in could not be completed. Please try again."}
    </p>
  );
}
