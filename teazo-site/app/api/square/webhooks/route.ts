import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

// Square signs the exact notification URL followed by the unmodified body.
// Use configured values rather than trusting the incoming Host headers.
export async function POST(request: Request) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;

  if (!signatureKey || !notificationUrl) {
    console.error("Square webhook signature key or notification URL is missing.");
    return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!signature) {
    return Response.json({ error: "Invalid signature." }, { status: 403 });
  }

  const body = await request.text();
  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + body)
    .digest("base64");
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);

  if (
    receivedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    return Response.json({ error: "Invalid signature." }, { status: 403 });
  }

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    !event || typeof event !== "object" ||
    !("type" in event) || typeof event.type !== "string"
  ) {
    return Response.json({ error: "Invalid event." }, { status: 400 });
  }

  // Acknowledge other signed events without changing the menu.
  if (event.type !== "catalog.version.updated") {
    return Response.json({ received: true, ignored: true });
  }

  if (!("event_id" in event) || typeof event.event_id !== "string" || !event.event_id) {
    return Response.json({ error: "Missing event ID." }, { status: 400 });
  }

  try {
    // The menu loaders use no-store: the next render fetches Square again.
    // Repeating these invalidations is safe for retries or out-of-order events.
    revalidatePath("/menu");
    revalidatePath("/admin/menu");
    console.info("Square catalog invalidated:", event.event_id);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Square catalog invalidation failed:", error);
    // A non-2xx response lets Square retry instead of losing this update.
    return Response.json({ error: "Catalog refresh failed." }, { status: 500 });
  }
}
