import Footer from "../(site)/components/footer";
import AdminLoginPage from "./login-client";
import type { Metadata } from "next";

export default function LoginPage() {
  return <AdminLoginPage footer={<Footer />} />;
}

export const metadata: Metadata = {
  title: "TEAZO Admin Login",
  referrer: "no-referrer",
};
