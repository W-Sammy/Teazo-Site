import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";

export type AdminsResponse = {
  admins: Admin[];

  // True only when the current user is the Owner.
  canEdit: boolean;
};

async function request<T>(
  input: RequestInfo,
  init?: RequestInit,
  unwrap = true,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    admin?: T;
    admins?: T;
  };

  if (!response.ok) {
    throw new Error(body.error || "The settings request failed.");
  }

  return (unwrap ? (body.admin ?? body.admins ?? body) : body) as T;
}

// Both Owner and Admin may view the administrator list.
export function fetchAdmins(): Promise<AdminsResponse> {
  return request<AdminsResponse>(
    "/api/admin/settings/admins",
    { cache: "no-store" },
    false,
  );
}

// The server independently requires Owner access for creation.
export function createAdmin(input: NewAdminInput): Promise<Admin> {
  return request<Admin>("/api/admin/settings/admins", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// The server independently requires Owner access for deletion.
export async function removeAdmin(id: string): Promise<void> {
  await request<unknown>(
    `/api/admin/settings/admins/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
