import { auth } from "@/auth";
import { prepare } from "./d1";

export type Admin = {
  id: string;
  username: string;
  role_id: number;
  can_invite_users: number;
};

type AdminApiAccess =
  | { ok: true; admin: Admin }
  | { ok: false; response: Response };

function accessResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Authenticate admin API requests and reject cross-origin writes. */
export async function requireAdminApi(
  request: Request,
  minRole: 1 | 2 | 3,
): Promise<AdminApiAccess> {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return { ok: false, response: accessResponse("Unauthorized.", 401) };
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (!origin || new URL(origin).host !== new URL(request.url).host) {
        return {
          ok: false,
          response: accessResponse("Request origin is not allowed.", 403),
        };
      }
    }

    const admin = await getAdmin(3);
    if (!admin) return { ok: false, response: accessResponse("Access denied.", 403) };
    if (admin.role_id > minRole) return { ok: false, response: accessResponse("Forbidden.", 403) };
    return { ok: true, admin };
  } catch (error) {
    console.error("Could not verify admin access:", error);
    return {
      ok: false,
      response: accessResponse("The admin service is unavailable.", 503),
    };
  }
}

/** Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access. */
export async function getAdmin(
  minRole: 1 | 2 | 3
): Promise<Admin | null> {
  const email = (await auth())?.user?.email;

  if (!email) return null;

  const admin = await prepare(
    `SELECT id, username, role_id, can_invite_users
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')`
  )
    .bind(email.trim().toLowerCase())
    .first<Admin>();

  return admin && admin.role_id <= minRole ? admin : null;
}
