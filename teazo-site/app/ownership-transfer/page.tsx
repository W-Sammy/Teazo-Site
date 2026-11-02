import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import OwnershipTransferClient from "./ownership-transfer-client";

export const metadata: Metadata = {
  title: "TEAZO Ownership Transfer",
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

type PageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

export default async function OwnershipTransferPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const token =
    typeof params.token === "string"
      ? params.token
      : "";

  // A 32-byte base64url token is 43 characters.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111] p-4 text-white">
        <section className="w-full max-w-lg rounded-xl border border-[#dbb082] bg-[#1c1917] p-6">
          <h1 className="text-xl font-semibold">
            Invalid ownership transfer link
          </h1>
          <p className="mt-3 text-sm text-gray-300">
            This link is missing or invalid. Please use
            the link from your ownership transfer email.
          </p>
        </section>
      </main>
    );
  }

  const session = await auth();

  // Preserve the link for authentication. Logging in
  // must not automatically accept the transfer.
  if (
    typeof session?.adminId !== "string" ||
    typeof session.sessionVersion !== "number"
  ) {
    const next = `/ownership-transfer?token=${token}`;

    redirect(
      `/login?next=${encodeURIComponent(next)}`,
    );
  }

  return <OwnershipTransferClient token={token} />;
}
