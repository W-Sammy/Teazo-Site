import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import type { MenuItem as CardMenuItem } from "../components/menu-item-card";
import MenuItemsSection from "../components/menu-items-section";
import { BubbleField } from "@/app/components/bubble-field";
import GeneralButton from "@/app/components/general-button";
import Subtitle from "../components/sub-title";
import { getWebsiteContent } from "@/app/lib/website-content";
import { allowedHosts } from "@/app/lib/imageHosts";
import type { MenuItem as ApiMenuItem } from "@/app/types/menu-item";

export const metadata: Metadata = {
  title: "Menu",
  description: "Explore TEAZO menu categories and featured specials.",
};

// Read the catalog at request time, not while building a static copy of the page.
export const dynamic = "force-dynamic";

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

/* Group real catalog items into sections accepted by MenuItemsSection.
   The section ID identifies the group; every card keeps its real catalog ID. */
type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: CardMenuItem[];
};

// Only validate the endpoint fields used by this page. Modifiers are not displayed.
type CatalogMenuItem = Pick<
  ApiMenuItem,
  | "catalogObjectId"
  | "name"
  | "description"
  | "variationId"
  | "priceCents"
  | "currency"
  | "imageUrl"
  | "categories"
>;

type MenuLoadResult =
  | { ok: true; sections: MenuSection[] }
  | { ok: false };

const uncategorizedSectionId = "uncategorized";

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/* Preserve the old order for recognized category names without creating items
   or inventing category membership. Additional categories sort alphabetically. */
const preferredCategoryNames = [
  "TEAZO Special",
  "Japanese Soufflé Pancake",
  "Tiramisu Cheezo",
  "Cheezo Tea",
  "Milk Tea",
  "Fresh Fruit Tea",
  "Matcha",
  "Caffeine Free Drink",
  "Dessert & Cake",
  "Snack",
].map(normalizeCategoryName);

// Existing presentation copy, applied only when the actual category name matches.
const categorySubtitles = new Map<string, string>([
  [
    normalizeCategoryName("Japanese Soufflé Pancake"),
    "Think cottony clouds of heaven that melt in your mouth",
  ],
  [
    normalizeCategoryName("Cheezo Tea"),
    "Fresh brewed premium tea with salty cheese cream",
  ],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCatalogMenuItem(value: unknown): value is CatalogMenuItem {
  return (
    isRecord(value) &&
    typeof value.catalogObjectId === "string" &&
    value.catalogObjectId.trim().length > 0 &&
    (value.name == null || typeof value.name === "string") &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.variationId === undefined || typeof value.variationId === "string") &&
    typeof value.priceCents === "number" &&
    Number.isSafeInteger(value.priceCents) &&
    value.priceCents >= 0 &&
    typeof value.currency === "string" &&
    /^[A-Z]{3}$/.test(value.currency) &&
    (value.imageUrl === null || typeof value.imageUrl === "string") &&
    Array.isArray(value.categories) &&
    value.categories.every(
      (category) =>
        isRecord(category) &&
        typeof category.id === "string" &&
        category.id.trim().length > 0 &&
        (category.name === null || typeof category.name === "string"),
    )
  );
}

function getCatalogImageUrl(value: string | null): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());

    // Match the existing HTTPS image-host configuration. A null image uses
    // MenuItemCard's logo fallback instead of an unsupported remote image URL.
    if (
      url.protocol !== "https:" ||
      !allowedHosts.includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function toCardItem(
  item: CatalogMenuItem,
  categoryId: string | null,
  categoryName: string | null,
): CardMenuItem {
  return {
    catalogObjectId: item.catalogObjectId,
    name: item.name?.trim() || "Unnamed item",
    variationId: item.variationId ?? null,

    // MenuItemCard already formats cents into a currency amount.
    priceCents: item.priceCents,
    currency: item.currency,

    imageUrl: getCatalogImageUrl(item.imageUrl),
    categoryId,
    categoryName,
    description: item.description?.trim() || undefined,
  };
}

function buildMenuSections(items: CatalogMenuItem[]): MenuSection[] {
  const categoryNames = new Map<string, string>();
  const sections = new Map<string, MenuSection>();
  const seenItemIds = new Set<string>();

  // Resolve labels by category ID, including a label supplied by another item.
  for (const item of items) {
    for (const category of item.categories) {
      const name = category.name?.trim();

      if (name && !categoryNames.has(category.id)) {
        categoryNames.set(category.id, name);
      }
    }
  }

  for (const item of items) {
    // Duplicate records from the endpoint must not create duplicate cards.
    if (seenItemIds.has(item.catalogObjectId)) continue;

    seenItemIds.add(item.catalogObjectId);

    const categoryIds = [
      ...new Set(item.categories.map((category) => category.id)),
    ];

    if (categoryIds.length === 0) {
      let section = sections.get(uncategorizedSectionId);

      if (!section) {
        section = {
          id: uncategorizedSectionId,
          title: "Other Menu Items",
          items: [],
        };

        sections.set(uncategorizedSectionId, section);
      }

      // Uncategorized items remain visible; no fabricated Square category is assigned.
      section.items.push(toCardItem(item, null, null));
      continue;
    }

    // An item assigned to multiple categories appears once in each category.
    for (const categoryId of categoryIds) {
      const sectionId = `category:${categoryId}`;
      const title = categoryNames.get(categoryId) ?? "Unnamed category";
      let section = sections.get(sectionId);

      if (!section) {
        section = {
          id: sectionId,
          title,
          subtitle: categorySubtitles.get(normalizeCategoryName(title)),
          items: [],
        };

        sections.set(sectionId, section);
      }

      section.items.push(toCardItem(item, categoryId, title));
    }
  }

  const result = Array.from(sections.values());

  for (const section of result) {
    section.items.sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", {
          sensitivity: "base",
          numeric: true,
        }) ||
        a.catalogObjectId.localeCompare(b.catalogObjectId),
    );
  }

  return result.sort((a, b) => {
    if (a.id === b.id) return 0;

    // Keep the uncategorized group last, independently of its display title.
    if (a.id === uncategorizedSectionId) return 1;
    if (b.id === uncategorizedSectionId) return -1;

    const aIndex = preferredCategoryNames.indexOf(
      normalizeCategoryName(a.title),
    );

    const bIndex = preferredCategoryNames.indexOf(
      normalizeCategoryName(b.title),
    );

    const aOrder =
      aIndex < 0 ? preferredCategoryNames.length : aIndex;

    const bOrder =
      bIndex < 0 ? preferredCategoryNames.length : bIndex;

    return (
      aOrder - bOrder ||
      a.title.localeCompare(b.title, "en", {
        sensitivity: "base",
        numeric: true,
      }) ||
      a.id.localeCompare(b.id)
    );
  });
}

async function loadMenu(): Promise<MenuLoadResult> {
  try {
    // Use the same configured site address as the working admin catalog loader.
    // Do not build this URL from an untrusted incoming Host header.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();

    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_BASE_URL is not configured for the menu loader.",
      );
    }

    const origin = new URL(baseUrl);

    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password
    ) {
      throw new Error(
        "The configured menu base URL must be an HTTP(S) site URL.",
      );
    }

    // A leading slash works whether the configured base URL ends in a slash or not.
    const endpoint = new URL("/api/square/products", origin);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(
        `The menu products endpoint returned HTTP ${response.status}.`,
      );
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data) || !data.every(isCatalogMenuItem)) {
      throw new Error(
        "The menu products endpoint returned an unexpected data format.",
      );
    }

    return {
      ok: true,
      sections: buildMenuSections(data),
    };
  } catch (error) {
    console.error("Public menu catalog loading failed:", error);

    // Never show old mock products as though they were the current catalog.
    return { ok: false };
  }
}

export default async function MenuPage() {
  const [content, menuResult] = await Promise.all([
    getWebsiteContent(),
    loadMenu(),
  ]);

  const logoSrc = content.logo || "/TEAZO_logo.svg";
  const sections = menuResult.ok ? menuResult.sections : [];

  // TEAZO Special is shown only when real items have that actual category.
  // Keep distinct category IDs separate, even when their display names match.
  const specialSections = sections.filter(
    (section) =>
      normalizeCategoryName(section.title) === "teazo special",
  );

  const menuSections = sections.filter(
    (section) =>
      normalizeCategoryName(section.title) !== "teazo special",
  );

  return (
    <main className="relative isolate min-h-screen bg-[#FFF8F9] text-stone-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <BubbleField />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-45 sm:px-8 lg:px-10">
        <section className="flex flex-col items-center text-center">
          <Image
            src={logoSrc}
            alt="TEAZO logo"
            aria-hidden="true"
            width={389}
            height={397}
            className="h-[170px] w-auto sm:h-[195px]"
            priority
            unoptimized={
              logoSrc.startsWith("data:") ||
              logoSrc.startsWith("http")
            }
          />

          <h1
            className={`${cabinSketch.className} mt-3 text-[70px] text-[#D9AE81]`}
          >
            MENU
          </h1>

          <div className="mt-4 flex flex-col items-center sm:mt-6">
            <p
              className={`${montserrat.className} text-[1.35rem] font-medium uppercase tracking-[0.18em] text-[#161616] sm:text-[1.55rem]`}
            >
              Too Much Scrolling?
            </p>

            <p
              className={`${montserrat.className} mt-1 text-[2rem] font-bold uppercase tracking-[0.06em] text-[#161616] sm:text-[2.5rem]`}
            >
              Download Our Menu
            </p>

            <div className="mt-5 cursor-pointer [&_*]:cursor-pointer">
              <GeneralButton text="DOWNLOAD" href="/static-menu" />
            </div>
          </div>

          <div className="relative mt-16 inline-flex items-center justify-center sm:mt-12">
            <Subtitle text={"Boba • Snacks • Desserts"} />
          </div>

          <p
            className={`${montserrat.className} mt-17 sm:mt-6 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg`}
          >
            Explore TEAZO menu categories and featured specials.
          </p>
        </section>

        {!menuResult.ok ? (
          <section
            role="alert"
            className="mx-auto mt-12 max-w-[1320px] rounded-[28px] bg-white px-5 py-8 text-center shadow-sm sm:px-6 lg:mt-20"
          >
            <h2
              className={`${montserrat.className} text-xl font-bold`}
            >
              Menu temporarily unavailable
            </h2>

            <p
              className={`${montserrat.className} mt-3 text-stone-700`}
            >
              We could not load the menu right now. Please try again, or use
              the Download button above to view the static menu.
            </p>

            {/* A plain GET form reloads the page without adding a client component. */}
            <form
              action="/menu"
              method="get"
              className="mt-5"
            >
              <button
                type="submit"
                className="rounded-lg border border-[#dbb082] px-4 py-2 font-semibold text-stone-900 hover:bg-[#fff8f9]"
              >
                Try again
              </button>
            </form>
          </section>
        ) : sections.length === 0 ? (
          <section
            className="mx-auto mt-12 max-w-[1320px] rounded-[28px] bg-white px-5 py-8 text-center shadow-sm sm:px-6 lg:mt-20"
          >
            <h2
              className={`${montserrat.className} text-xl font-bold`}
            >
              No menu items available
            </h2>

            <p
              className={`${montserrat.className} mt-3 text-stone-700`}
            >
              Please check back soon, or use the Download button above to
              view the static menu.
            </p>
          </section>
        ) : (
          <>
            {/* Real featured-category items retain the existing special-section layout. */}
            {specialSections.map((section) => (
              <MenuItemsSection
                key={section.id}
                title={section.title}
                subtitle={section.subtitle}
                items={section.items}
                className="mx-auto mt-12 max-w-[1320px] lg:mt-20"
                headingClassName={cabinSketch.className}
                bodyClassName={montserrat.className}
              />
            ))}

            {/* Full menu categories use the shared section renderer in a vertical grid. */}
            {menuSections.length > 0 && (
              <div className="mx-auto mt-16 grid max-w-[1320px] grid-cols-1 gap-6 lg:mt-20 lg:gap-8">
                {menuSections.map((section) => (
                  <MenuItemsSection
                    key={section.id}
                    title={section.title}
                    subtitle={section.subtitle}
                    items={section.items}
                    headingClassName={cabinSketch.className}
                    bodyClassName={montserrat.className}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}