import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { D1Error } from "@/app/lib/d1";
import { getShopMetricDate, consumeAnalyticsRateLimit } from "@/app/lib/queries/analytics";
import { recordMenuItemView } from "@/app/admin/menu/handlers/record-menu-item-view";

const SESSION_COOKIE = "teazo_analytics_session";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getRateKey(request: Request) {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const responseHeaders = new Headers({ "Cache-Control": "no-store" });

  if (!sessionId || sessionId.length > 100) {
    sessionId = randomUUID();
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    responseHeaders.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${sessionId}; Max-Age=86400; Path=/; SameSite=Lax${secure}`,
    );
  }

  return {
    key: createHash("sha256").update(sessionId).digest("hex"),
    responseHeaders,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {
      itemId?: unknown;
      itemName?: unknown;
    } | null;

    if (
      !body ||
      typeof body.itemId !== "string" ||
      typeof body.itemName !== "string" ||
      !body.itemId.trim() ||
      !body.itemName.trim() ||
      body.itemId.length > 200 ||
      body.itemName.length > 300
    ) {
      return errorResponse("Invalid menu item.", 400);
    }

    const { key, responseHeaders } = await getRateKey(request);
    if (!(await consumeAnalyticsRateLimit(key))) {
      return Response.json(
        { error: "Analytics rate limit exceeded." },
        { status: 429, headers: responseHeaders },
      );
    }

    await recordMenuItemView(getShopMetricDate(), body.itemId, body.itemName);
    return Response.json({ ok: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Could not record menu item view:", error);
    return errorResponse(
      "Analytics is temporarily unavailable.",
      error instanceof D1Error ? 503 : 500,
    );
  }
}
