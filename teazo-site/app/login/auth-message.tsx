"use client";

import { useSearchParams } from "next/navigation";

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
    <p role="alert" className="mb-4 text-center text-sm text-red-600">
      {messages[error] ?? "Sign-in could not be completed. Please try again."}
    </p>
  );
}
