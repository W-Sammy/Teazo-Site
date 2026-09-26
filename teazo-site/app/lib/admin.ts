import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import {
  findAuthorizedAdmin,
  type Admin,
  type AdminRole,
} from "./admin-whitelist";

export type { Admin } from "./admin-whitelist";

type AdminAccess =
  | { ok: true; admin: Admin }
  | { ok: false; status: 401 | 403 };

type ApiAccess = { ok: true; admin: Admin } | { ok: false; response: Response };

// React cache deduplicates checks during one server render.
// It does not persist authorization results across requests.
const getAdminAccess = cache(
  async (minRole: AdminRole): Promise<AdminAccess> => {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
      return { ok: false, status: 401 };
    }

    const admin = await findAuthorizedAdmin(email);

    if (!admin || admin.role_id > minRole) {
      return { ok: false, status: 403 };
    }

    return { ok: true, admin };
  },
);

export async function getAdmin(minRole: AdminRole): Promise<Admin | null> {
  const access = await getAdminAccess(minRole);

  return access.ok ? access.admin : null;
}

export async function requireAdminPage(minRole: AdminRole = 3): Promise<Admin> {
  let access: AdminAccess;

  try {
    access = await getAdminAccess(minRole);
  } catch {
    console.error("Admin page authorization lookup failed.");
    redirect("/login?error=ServiceUnavailable");
  }

  if (!access.ok) {
    redirect(access.status === 401 ? "/login" : "/login?error=AccessDenied");
  }

  return access.admin;
}

function denyApi(status: number, message: string): ApiAccess {
  return {
    ok: false,
    response: Response.json(
      { error: message },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    ),
  };
}

export async function requireAdminApi(
  request: Request,
  minRole: AdminRole = 3,
): Promise<ApiAccess> {
  let access: AdminAccess;

  try {
    access = await getAdminAccess(minRole);
  } catch {
    console.error("Admin API authorization lookup failed.");

    return denyApi(503, "Authorization is temporarily unavailable.");
  }

  if (!access.ok) {
    return denyApi(
      access.status,
      access.status === 401
        ? "Authentication required."
        : "You do not have permission to perform this action.",
    );
  }

  // Cookie-authenticated writes must originate from this site.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");

    if (!origin || origin !== new URL(request.url).origin) {
      return denyApi(403, "Request origin is not allowed.");
    }
  }

  return { ok: true, admin: access.admin };
}
