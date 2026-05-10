import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Teazo Admin Login",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}