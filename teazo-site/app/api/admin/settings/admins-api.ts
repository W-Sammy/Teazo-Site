import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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
  return (body.admin ?? body.admins ?? body) as T;
}

export function fetchAdmins(): Promise<Admin[]> {
  return request<Admin[]>("/api/admin/settings/admins", { cache: "no-store" });
}

export function createAdmin(input: NewAdminInput): Promise<Admin> {
  return request<Admin>("/api/admin/settings/admins", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminRole(id: string, role: AdminRole): Promise<Admin> {
  return request<Admin>(`/api/admin/settings/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function updateInvitePermission(id: string, canInviteUsers: boolean): Promise<Admin> {
  return request<Admin>(`/api/admin/settings/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ canInviteUsers }),
  });
}

export async function removeAdmin(id: string): Promise<void> {
  await request<unknown>(`/api/admin/settings/admins/${id}`, { method: "DELETE" });
}
