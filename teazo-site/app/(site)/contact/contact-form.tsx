"use client";

import { useActionState } from "react";
import { submitContactMessage, type ContactFormState } from "./actions";

const INPUT_CLASS =
  "h-14 w-full border-2 border-[#b9aaa4] bg-white px-4 text-[0.95rem] font-semibold tracking-[0.08em] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#cd8f84]";

const INITIAL_STATE: ContactFormState = { status: "idle" };

export default function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const [state, formAction, pending] = useActionState(submitContactMessage, INITIAL_STATE);

  // The form clears itself after every submission. After an error, these put
  // back what the visitor typed so nothing is lost.
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form
      action={formAction}
      className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-5"
    >
      {/* Honeypot: invisible to people, so anything typed here came from a bot. */}
      <div aria-hidden="true" className="pointer-events-none fixed -left-[9999px] top-0 opacity-0">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid w-full gap-5 md:grid-cols-2">
        <input
          type="text"
          name="firstName"
          placeholder="FIRST NAME"
          aria-label="First name"
          autoComplete="given-name"
          required
          maxLength={100}
          defaultValue={values?.firstName}
          className={INPUT_CLASS}
        />
        <input
          type="text"
          name="lastName"
          placeholder="LAST NAME"
          aria-label="Last name"
          autoComplete="family-name"
          maxLength={100}
          defaultValue={values?.lastName}
          className={INPUT_CLASS}
        />
        <input
          type="email"
          name="email"
          placeholder="EMAIL"
          aria-label="Email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={values?.email}
          className={INPUT_CLASS}
        />
        <input
          type="text"
          name="subject"
          placeholder="SUBJECT"
          aria-label="Subject"
          maxLength={200}
          defaultValue={values?.subject}
          className={INPUT_CLASS}
        />
      </div>

      <textarea
        name="message"
        placeholder="MESSAGE"
        aria-label="Message"
        rows={8}
        required
        maxLength={5000}
        defaultValue={values?.message}
        className="min-h-[250px] w-full resize-y border-2 border-[#b9aaa4] bg-white px-4 py-4 text-[0.95rem] font-semibold tracking-[0.08em] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#cd8f84]"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-[66px] w-[210px] cursor-pointer items-center justify-center bg-black text-[1rem] font-bold tracking-[0.12em] text-white transition hover:bg-[#FFBDC7] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "SENDING..." : "SUBMIT"}
      </button>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 max-w-[640px] text-center text-sm font-semibold tracking-[0.04em]"
      >
        {state.status === "sent" && (
          <span className="text-stone-700">
            Thank you. Your message was sent, and we will get back to you soon.
          </span>
        )}
        {state.status === "error" && (
          <span className="text-[#b4531f]">
            {state.message} You can also email us at{" "}
            <a href={`mailto:${fallbackEmail}`} className="underline">
              {fallbackEmail}
            </a>
            .
          </span>
        )}
      </p>
    </form>
  );
}
