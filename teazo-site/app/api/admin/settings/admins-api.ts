import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";

export type AdminsResponse = {
  admins: Admin[];

  // True only when the current user is the Owner.
  canEdit: boolean;
};

export type CreateAdminResponse = {
  admin: Admin;
  invitation: {
    submitted: boolean;
    message: string;
  };
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
    throw new Error(
      body.error || "The administrator-management request failed.",
    );
  }

  return (unwrap ? (body.admin ?? body.admins ?? body) : body) as T;
}

// The server requires Owner access to read the administrator list.
export function fetchAdmins(): Promise<AdminsResponse> {
  return request<AdminsResponse>(
    "/api/admin/settings/admins",
    { cache: "no-store" },
    false,
  );
}

// The server requires Owner access for creation.
export function createAdmin(
  input: NewAdminInput,
): Promise<CreateAdminResponse> {
  return request<CreateAdminResponse>(
    "/api/admin/settings/admins",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    false,
  );
}

// The server independently requires Owner access for username editing.
// Only the username field is sent. Roles, permissions, email addresses,
// and other account details cannot be modified through this request.
export function updateAdminUsername(
  id: string,
  username: string,
): Promise<Admin> {
  return request<Admin>(
    `/api/admin/settings/admins/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ username }),
    },
  );
}

// The server independently requires Owner access for deletion.
export async function removeAdmin(id: string): Promise<void> {
  await request<unknown>(
    `/api/admin/settings/admins/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// Invitation resending is also restricted to Owner server-side.
export function resendAdminInvitation(
  id: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/admin/${encodeURIComponent(id)}/resend-invitation`,
    { method: "POST" },
  );
}
