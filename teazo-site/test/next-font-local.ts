// Stands in for "next/font/local" under Vitest (see vitest.config.mts). The real
// loader only runs inside a Next.js build; tests just need a class name.
export default function localFont() {
  return { className: "", variable: "", style: { fontFamily: "" } };
}
