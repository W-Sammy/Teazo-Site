"use client";

import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Purpose = "setup" | "reset";
type View = "request" | "complete" | "success" | null;

type Props = {
  initialEmail?: string;
  disabled?: boolean;
};

export default function PasswordFlow(props: Props) {
  const searchParams = useSearchParams();

  const action = searchParams.get("passwordAction");
  const purpose = action === "setup" || action === "reset" ? action : null;

  const token = searchParams.get("token") ?? "";

  return (
    <PasswordDialog
      key={JSON.stringify([purpose, token])}
      {...props}
      initialPurpose={purpose}
      initialToken={token}
    />
  );
}

function PasswordDialog({
  initialEmail = "",
  disabled = false,
  initialPurpose,
  initialToken,
}: Props & {
  initialPurpose: Purpose | null;
  initialToken: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);

  const [view, setView] = useState<View>(
    initialPurpose ? (initialToken ? "complete" : "request") : null,
  );

  const purpose: Purpose = initialPurpose ?? "reset";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [invalidToken, setInvalidToken] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (view !== null && !dialog.open) {
      dialog.showModal();
    } else if (view === null && dialog.open) {
      dialog.close();
    }
  }, [view]);

  function cleanLink(nextPurpose?: Purpose) {
    const url = new URL(window.location.href);

    url.searchParams.delete("token");
    url.searchParams.delete("passwordAction");

    if (nextPurpose) {
      url.searchParams.set("passwordAction", nextPurpose);
    }

    router.replace(`${url.pathname}${url.search}${url.hash}`, {
      scroll: false,
    });
  }

  function closeDialog() {
    if (submittingRef.current) return;

    setView(null);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage("");
    setInvalidToken(false);

    cleanLink();
  }

  function openRequest() {
    setEmail(initialEmail);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage("");
    setInvalidToken(false);
    setView("request");
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;
    if (view !== "request" && view !== "complete") return;

    const completingPassword = view === "complete";

    setError(null);

    if (completingPassword) {
      const length = password.length;

      if (length < 6 || length > 128) {
        setError("Use a password between 6 and 128 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Your passwords do not match.");
        return;
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch(
        completingPassword
          ? "/api/admin/password/complete"
          : "/api/admin/password/request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            completingPassword
              ? {
                  token: initialToken,
                  purpose,
                  password,
                  confirmPassword,
                }
              : {
                  email: email.trim().toLowerCase(),
                },
          ),
          cache: "no-store",
          referrerPolicy: "no-referrer",
        },
      );

      const data = (await response.json()) as {
        message?: string;
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Unable to complete this request.");
        setInvalidToken(data.code === "INVALID_TOKEN");
        return;
      }

      setMessage(
        data.message ??
          (completingPassword
            ? "Your password has been saved. Sign in to continue."
            : "If this email is eligible, a password link will be sent shortly."),
      );

      setView("success");
    } catch {
      setError(
        "Unable to complete the request. Check your connection and try again.",
      );
    } finally {
      if (completingPassword) {
        setPassword("");
        setConfirmPassword("");
      }

      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const title =
    view === "success"
      ? "Request complete"
      : view === "request"
        ? "Set or reset your password"
        : purpose === "setup"
          ? "Create your password"
          : "Reset your password";

  const inputClass =
    "mt-2 w-full rounded-md border border-gray-400 px-3 py-2 text-black outline-none focus:border-[#D9AB79]";

  return (
    <>
      <div className="mt-5 flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => openRequest()}
          className="cursor-pointer text-sm font-semibold hover:underline disabled:opacity-50"
        >
          SET OR RESET PASSWORD
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="password-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg bg-white p-6 text-black shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="password-dialog-title" className="text-xl font-semibold">
            {title}
          </h2>

          <button
            type="button"
            aria-label="Close password dialog"
            disabled={isSubmitting}
            onClick={closeDialog}
            className="cursor-pointer text-xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {view === "success" ? (
          <div className="mt-5">
            <p role="status">{message}</p>

            <button
              type="button"
              onClick={closeDialog}
              className="mt-6 w-full rounded-md bg-black px-4 py-3 text-white"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            aria-busy={isSubmitting}
            className="mt-5"
          >
            <fieldset disabled={isSubmitting} className="space-y-4">
              {view === "request" ? (
                <>
                  <p className="text-sm text-gray-600">
                    Enter your admin email. We'll send you a link to create or
                    reset your password.
                  </p>

                  <label className="block text-sm font-medium">
                    Email
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                </>
              ) : (
                <>
                  <p
                    id="password-requirements"
                    className="text-sm text-gray-600"
                  >
                    Use a minimum of 6 characters for your password.
                  </p>

                  <label className="block text-sm font-medium">
                    New password
                    <input
                      type="password"
                      name="newPassword"
                      autoComplete="new-password"
                      aria-describedby="password-requirements"
                      required
                      maxLength={256}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={inputClass}
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Confirm password
                    <input
                      type="password"
                      name="confirmPassword"
                      autoComplete="new-password"
                      required
                      maxLength={256}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}

              {invalidToken ? (
                <button
                  type="button"
                  onClick={() => cleanLink(purpose)}
                  className="w-full rounded-md bg-black px-4 py-3 text-white"
                >
                  Request another link
                </button>
              ) : (
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-md bg-black px-4 py-3 text-white disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Please wait…"
                    : view === "request"
                      ? "Send email link"
                      : "Save password"}
                </button>
              )}
            </fieldset>
          </form>
        )}
      </dialog>
    </>
  );
}
