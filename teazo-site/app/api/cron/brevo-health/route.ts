
const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function healthcheckUrl(
  baseUrl: string,
  status: "success" | "fail"
): string {
  const url = new URL(baseUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname !== "hc-ping.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname)
  ) {
    throw new Error("Invalid monitoring URL");
  }

  url.pathname =
    url.pathname.replace(/\/+$/, "") +
    (status === "fail" ? "/fail" : "");

  return url.toString();
}

async function reportHealthcheck(
  status: "success" | "fail"
): Promise<void> {
  const baseUrl = process.env.BREVO_HEALTHCHECK_URL;

  if (!baseUrl) {
    console.warn(
      "[brevo-health] Healthchecks monitoring is not configured."
    );
    return;
  }

  try {
    const url = healthcheckUrl(baseUrl, status);

    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      console.error(
        `[brevo-health] Monitoring ping failed with HTTP ${response.status}.`
      );
    }
  } catch {
    // Never log the monitoring URL or its embedded token.
    console.error("[brevo-health] Could not report monitoring status.");
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error(
      "[brevo-health] BREVO_API_KEY is not configured."
    );

    await reportHealthcheck("fail");

    return Response.json(
      { error: "Brevo health check is not configured." },
      { status: 503, headers: NO_STORE_HEADERS }
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

      await reportHealthcheck("fail");

      return Response.json(
        { error: "Brevo health check failed." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    console.info("[brevo-health] Brevo API check succeeded.");

    await reportHealthcheck("success");

    return Response.json(
      { ok: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch {
    console.error("[brevo-health] Brevo API request failed.");

    await reportHealthcheck("fail");

    return Response.json(
      { error: "Brevo health check failed." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
