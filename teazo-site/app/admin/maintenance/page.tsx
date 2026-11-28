import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin",
  },
};

type MaintenanceResource = {
  title: string;
  description: string;
  href: string | null;
  linkLabel: string;
};

// Each resource entry automatically generates a maintenance resource card.
// Add additional user guides by adding entries to this array.
// For PDF manuals, use "Open PDF" as the linkLabel and set href
// to the finalized document URL.
// A null href displays a Coming soon placeholder.
// Documents requiring private access must use a protected URL.
const resources: MaintenanceResource[] = [
  {
    title: "User Manual",
    description:
      "Learn how to manage your Teazo website and use its administrative features.",
    href: null,
    linkLabel: "Open PDF",
  },
  {
    title: "GitHub Repository",
    description:
      "Access the Teazo website project repository.",
    href: "https://github.com/W-Sammy/Teazo-Site",
    linkLabel: "Open GitHub Repository",
  },
];

export default async function AdminMaintenancePage() {
  // Require a valid authenticated administrator session.
  const admin = await requireAdminPage(2);

  // Only the Owner may access maintenance resources.
  // Hiding the navigation tab alone is not sufficient authorization.
  if (admin.role_id !== 1) {
    return (
      <div className="w-full min-w-0 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
        <section
          role="alert"
          className="max-w-xl rounded-lg border border-[#dbb082] bg-[#1c1917] p-6 text-white"
        >
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-3 text-sm text-gray-300">
            Only the Owner can access maintenance resources.
          </p>

          <Link
            href="/admin"
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#dbb082] bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252525]"
          >
            Return to Dashboard
          </Link>
        </section>
      </div>
    );
  }

  return (
    <main className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Maintenance
          </h1>

          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            Access user guides and resources for your Teazo website.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {resources.map((resource) => (
            <section
              key={resource.title}
              className="flex min-w-0 flex-col rounded-xl border border-[#dbb082] p-5 sm:p-6"
            >
              <h2 className="text-lg font-semibold">
                {resource.title}
              </h2>

              <p className="mb-6 mt-3 text-sm leading-6 text-gray-500">
                {resource.description}
              </p>

              <div className="mt-auto">
                {resource.href ? (
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#dbb082] bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252525]"
                  >
                    {resource.linkLabel}

                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0"
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                    </svg>
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">
                    Coming soon
                  </span>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}