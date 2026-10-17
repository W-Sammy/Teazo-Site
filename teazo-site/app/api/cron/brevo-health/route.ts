
const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error("[brevo-health] BREVO_API_KEY is not configured.");

    return Response.json(
      { error: "Brevo health check is not configured." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(BREVO_ACCOUNT_URL, {
      method: "GET",
      headers: {
        "api-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(
        `[brevo-health] Brevo API check failed with HTTP ${response.status}.`
      );

      return Response.json(
        { error: "Brevo health check failed." },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    console.info("[brevo-health] Brevo API check succeeded.");

    return Response.json(
      { ok: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    console.error("[brevo-health] Brevo API request failed.");

    return Response.json(
      { error: "Brevo health check failed." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
