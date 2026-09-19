import { toPublicUrl } from "@/app/lib/media";
import { getCurrentMenuDocument } from "@/app/lib/queries/menu-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public read only. The browser never receives the Worker token or local URL. */
async function serveMenu(request: Request, headOnly: boolean): Promise<Response> {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    const menu = await getCurrentMenuDocument();

    // Until the first upload, keep the PDF already shipped in public/ available.
    if (!menu) {
      headers.set("Location", "/teazo-menu.pdf");
      return new Response(null, { status: 307, headers });
    }

    // Never let database text turn this into an arbitrary file-fetch endpoint.
    if (!/^documents\/menu\/[a-z0-9/_.-]+\.pdf$/.test(menu.r2_key) ||
        menu.r2_key.includes("..") || menu.r2_key.includes("//")) {
      throw new Error("Invalid menu storage key");
    }

    const upstreamHeaders = new Headers();
    const range = request.headers.get("range");
    if (range) upstreamHeaders.set("Range", range);

    // A same-origin read works from Windows, Safari and LAN-connected phones.
    // Only the server contacts the local Worker at 127.0.0.1.
    const upstream = await fetch(toPublicUrl(menu.r2_key), {
      method: headOnly ? "HEAD" : "GET",
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "error",
    });

    if (upstream.status === 416) {
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) headers.set("Content-Range", contentRange);
      await upstream.body?.cancel();
      return new Response(null, { status: 416, headers });
    }

    if (!upstream.ok || (!headOnly && !upstream.body)) {
      await upstream.body?.cancel();
      throw new Error(`Menu storage returned ${upstream.status}`);
    }

    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", 'inline; filename="teazo-menu.pdf"');
    for (const name of ["accept-ranges", "content-range", "content-length"]) {
      // fetch may decode compressed bodies, so do not copy their encoded length.
      if (name === "content-length" && upstream.headers.has("content-encoding")) continue;
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(headOnly ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error("Could not open the current menu:", error);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(
      headOnly ? null : "The menu is temporarily unavailable. Please try again shortly.",
      { status: 503, headers },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return serveMenu(request, false);
}

export async function HEAD(request: Request): Promise<Response> {
  return serveMenu(request, true);
}
