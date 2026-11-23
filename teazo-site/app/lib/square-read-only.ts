import "server-only";

/** Call before handling a Square write. Catalog and order reads stay available. */
export function squareWriteBlockedResponse(): Response | null {
  if (process.env.SQUARE_READ_ONLY?.trim().toLowerCase() !== "true") return null;

  return Response.json(
    {
      error: "Square is in read-only mode. Checkout and Square menu changes are temporarily disabled.",
      code: "SQUARE_READ_ONLY",
    },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
