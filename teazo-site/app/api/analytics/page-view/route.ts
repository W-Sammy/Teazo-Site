import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { D1Error } from "@/app/lib/d1";
import {
  consumeAnalyticsRateLimit,
  getShopMetricDate,
  isAnalyticsPageKey,
  recordPageView,
} from "@/app/lib/queries/analytics";

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
    responseHeaders.append("Set-Cookie", `${SESSION_COOKIE}=${sessionId}; Max-Age=86400; Path=/; SameSite=Lax${secure}`);
  }
  return {
    key: createHash("sha256").update(sessionId).digest("hex"),
    responseHeaders,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { pageKey?: unknown } | null;
    if (!body || !isAnalyticsPageKey(body.pageKey)) return errorResponse("Invalid page key.", 400);

    const { key, responseHeaders } = await getRateKey(request);
    if (!(await consumeAnalyticsRateLimit(key))) return errorResponse("Analytics rate limit exceeded.", 429);

    await recordPageView(getShopMetricDate(), body.pageKey);
    return Response.json({ ok: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Could not record page view:", error);
    return errorResponse("Analytics is temporarily unavailable.", error instanceof D1Error ? 503 : 500);
  }
}
