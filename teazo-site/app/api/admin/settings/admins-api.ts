import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";

export type AdminsResponse = {
  admins: Admin[];
  canEdit: boolean;
};

export type CreateAdminResponse = {
  admin: Admin;
  invitation: {
    submitted: boolean;
    message: string;
  };
};

async function request<T>(input: RequestInfo, init?: RequestInit, unwrap = true): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    admin?: T;
    admins?: T;
  };
  if (!response.ok) throw new Error(body.error || "The settings request failed.");
  return (unwrap ? (body.admin ?? body.admins ?? body) : body) as T;
}

export function fetchAdmins(): Promise<AdminsResponse> {
  return request<AdminsResponse>("/api/admin/settings/admins", { cache: "no-store" }, false);
}

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

export function updateAdminRole(id: string, role: AdminRole): Promise<Admin> {
  return request<Admin>(`/api/admin/settings/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function updateManageAdminsPermission(id: string, canManageAdmins: boolean): Promise<Admin> {
  return request<Admin>(`/api/admin/settings/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ canManageAdmins }),
  });
}

export async function removeAdmin(id: string): Promise<void> {
  await request<unknown>(`/api/admin/settings/admins/${id}`, { method: "DELETE" });
}

export function resendAdminInvitation(
  id: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/admin/admins/${encodeURIComponent(id)}/resend-invitation`,
    { method: "POST" },
  );
}