
const ALLOWED_LAN_DEV_ORIGIN = "http://10.0.0.142:3000";

// Validate the Origin header of an authenticated admin write.
// In development, allow the known LAN address when its Host
// header matches, even if Next.js uses an internal request URL.
export function isAllowedAdminWriteOrigin(
  request: Request,
  environment: string | undefined = process.env.NODE_ENV,
): boolean {
  const origin = request.headers.get("origin");

  if (origin === null) {
    return false;
  }

  const requestOrigin = new URL(request.url).origin;

  if (origin === requestOrigin) {
    return true;
  }

  if (environment !== "development") {
    return false;
  }

  if (origin !== ALLOWED_LAN_DEV_ORIGIN) {
    return false;
  }

  const host = request.headers.get("host");

  if (!host) {
    return false;
  }

  return (
    host.toLowerCase() ===
    new URL(ALLOWED_LAN_DEV_ORIGIN).host.toLowerCase()
  );
}
