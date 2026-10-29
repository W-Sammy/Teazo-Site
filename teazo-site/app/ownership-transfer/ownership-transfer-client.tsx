"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

type TransferReview = {
  id: string;
  ownerUsername: string;
  recipientUsername: string;
  expiresAt: number;
};

type ReviewResponse = {
  transfer?: TransferReview;
  error?: string;
};

type DecisionResponse = {
  status?: "accepted" | "declined";
  message?: string;
  error?: string;
};

type Stage =
  | "loading"
  | "ready"
  | "accepted"
  | "declined"
  | "error";

type Props = {
  token: string;
};

export default function OwnershipTransferClient({
  token,
}: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [transfer, setTransfer] =
    useState<TransferReview | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const submittingRef = useRef(false);

  const next = `/ownership-transfer?token=${token}`;
  const loginUrl =
    `/login?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    let active = true;

    async function loadTransfer() {
      try {
        const response = await fetch(
          "/api/admin/ownership-transfer/review",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ token }),
          },
        );

        const result =
          (await response.json()) as ReviewResponse;

        if (!response.ok || !result.transfer) {
          throw new Error(
            result.error ??
              "This ownership offer could not be verified.",
          );
        }

        if (active) {
          setTransfer(result.transfer);
          setStage("ready");
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to review ownership transfer.",
          );
          setStage("error");
        }
      }
    }

    void loadTransfer();

    return () => {
      active = false;
    };
  }, [token]);

  async function submitDecision(
    decision: "accepted" | "declined",
  ) {
    if (
      stage !== "ready" ||
      !transfer ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/ownership-transfer/decision",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            token,
            decision,
          }),
        },
      );

      const result =
        (await response.json()) as DecisionResponse;

      if (!response.ok || result.status !== decision) {
        throw new Error(
          result.error ??
            "The ownership decision could not be completed.",
        );
      }

      setMessage(
        result.message ??
          "Your ownership decision was recorded.",
      );
      setStage(decision);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to process ownership decision.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function switchAccount() {
    void signOut({
      redirectTo: loginUrl,
    });
  }

  function signInAgain() {
    void signOut({
      redirectTo: "/login",
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111] p-4 text-white">
      <section className="w-full max-w-lg rounded-xl border border-[#dbb082] bg-[#1c1917] p-6 shadow-xl">
        <div className="mb-5 text-center">
          <p className="text-sm font-semibold tracking-widest text-[#dbb082]">
            TEAZO
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Ownership Transfer
          </h1>
        </div>

        {stage === "loading" && (
          <p role="status" className="text-sm text-gray-300">
            Verifying your ownership offer...
          </p>
        )}

        {stage === "error" && (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-red-400">
              {message}
            </p>

            <p className="text-sm text-gray-300">
              The link may have expired or already been used,
              or you may be signed in with a different
              administrator account.
            </p>

            <button
              type="button"
              onClick={switchAccount}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Sign in with another account
            </button>
          </div>
        )}

        {stage === "ready" && transfer && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              The TEAZO Owner has offered to transfer ownership
              of the website to your administrator account.
            </p>

            <div className="rounded-lg border border-[#dbb082]/40 p-4 text-sm">
              <p className="break-words">
                Current Owner:{" "}
                <strong>
                  {transfer.ownerUsername}
                </strong>
              </p>

              <p className="mt-2 break-words">
                Receiving account:{" "}
                <strong>
                  {transfer.recipientUsername}
                </strong>
              </p>

              <p className="mt-2">
                Expires:{" "}
                {new Date(
                  transfer.expiresAt * 1000,
                ).toLocaleString()}
              </p>
            </div>

            <p className="text-sm text-gray-300">
              If you accept, you will become the sole Owner.
              The current Owner will become an Admin and lose
              Owner privileges, including access to the
              Owner-only Admin page.
            </p>

            <p className="text-sm font-semibold text-[#dbb082]">
              This change cannot be automatically reversed.
              Both accounts will need to sign in again
              after the transfer.
            </p>

            <p className="text-sm text-gray-300">
              Declining cancels this offer. Both accounts
              keep their existing roles, and the current
              Owner may send another offer later.
            </p>

            {message && (
              <p role="alert" className="text-sm text-red-400">
                {message}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  void submitDecision("declined")
                }
                className="rounded-lg border border-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-[#292929] disabled:opacity-50"
              >
                Decline
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  void submitDecision("accepted")
                }
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-[#292929] disabled:opacity-50"
              >
                {isSubmitting
                  ? "Processing..."
                  : "Accept Ownership"}
              </button>
            </div>
          </div>
        )}

        {stage === "accepted" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Ownership transfer completed
            </h2>

            <p role="status" className="text-sm text-gray-300">
              {message}
            </p>

            <p className="text-sm text-gray-300">
              Your previous session is no longer valid.
              Sign in again to use your new Owner access.
            </p>

            <button
              type="button"
              onClick={signInAgain}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Sign in again
            </button>
          </div>
        )}

        {stage === "declined" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Ownership offer declined
            </h2>

            <p role="status" className="text-sm text-gray-300">
              {message}
            </p>

            <Link
              href="/admin"
              className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Return to Dashboard
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
