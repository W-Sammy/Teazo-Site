import { deleteExpiredAnalytics, getShopMetricDate, shiftMetricDate } from "@/app/lib/queries/analytics";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Keep today and the previous 29 local calendar days.
    const cutoffDate = shiftMetricDate(getShopMetricDate(), -29);
    const deleted = await deleteExpiredAnalytics(cutoffDate);
    return Response.json({ ok: true, cutoffDate, deleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not clean up analytics:", error);
    return Response.json({ error: "Analytics cleanup failed." }, { status: 503 });
  }
}
