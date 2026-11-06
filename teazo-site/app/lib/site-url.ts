import "server-only";

/** Explicit configuration wins; automatic preview URLs stay on that deployment. */
export function applicationUrl(): string {
  let configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    if (process.env.VERCEL_ENV === "preview") {
      const previewHost = process.env.VERCEL_URL?.trim();
      if (!previewHost) throw new Error("A preview application URL is required.");
      configured = `https://${previewHost}`;
    } else if (process.env.VERCEL_ENV === "production") {
      const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
      configured = productionHost && !productionHost.endsWith(".vercel.app")
        ? `https://${productionHost}` : "https://teazous.com";
    } else if (process.env.NODE_ENV === "development") {
      configured = "http://localhost:3000";
    } else {
      throw new Error("NEXT_PUBLIC_BASE_URL is required.");
    }
  }

  const url = new URL(configured);
  const localDevelopment = process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) ||
    url.username || url.password) {
    throw new Error("Invalid application URL.");
  }
  return url.origin;
}
