import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    adminId?: string;
    sessionVersion?: number;
  }

  interface Session {
    adminId?: string;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    adminId?: string;
    sessionVersion?: number;
  }
}