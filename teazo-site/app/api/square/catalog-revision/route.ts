import { getCatalogRevision } from "@/app/lib/queries/catalog-revision";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ revision: await getCatalogRevision() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Catalog revision lookup failed:", error);
    return Response.json({ error: "Menu updates could not be checked." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
