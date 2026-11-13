import localFont from "next/font/local";

/*
 * Montserrat for the whole site, from ONE variable font file (all weights,
 * Latin, 38 KB) instead of a separate file per weight (TZ-515). Pages that used
 * four or five weights downloaded about 100 KB of Montserrat; now it is 38 KB.
 *
 * Each export matches one of the old next/font/google declarations:
 * - montserrat: for several weights. Its class sets no weight, so Tailwind's
 *   font-bold / font-medium (or the browser default) pick it, as before.
 * - montserrat400 … montserrat800: one weight. Their class sets that weight,
 *   like Montserrat({ weight: ["800"] }) did.
 *
 * Source: Google Fonts Montserrat v31, Latin subset. License: fonts/OFL-Montserrat.txt.
 */
export const montserrat = localFont({
  src: [{ path: "./fonts/montserrat-latin-variable.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
});

export const montserrat400 = localFont({ src: "./fonts/montserrat-latin-variable.woff2", weight: "400", display: "swap", preload: false });
export const montserrat500 = localFont({ src: "./fonts/montserrat-latin-variable.woff2", weight: "500", display: "swap", preload: false });
export const montserrat600 = localFont({ src: "./fonts/montserrat-latin-variable.woff2", weight: "600", display: "swap", preload: false });
export const montserrat700 = localFont({ src: "./fonts/montserrat-latin-variable.woff2", weight: "700", display: "swap", preload: false });
export const montserrat800 = localFont({ src: "./fonts/montserrat-latin-variable.woff2", weight: "800", display: "swap", preload: false });
