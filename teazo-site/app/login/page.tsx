import Footer from "../(site)/components/footer";
import AdminLoginPage from "./login-client";

export default function LoginPage() {
  return <AdminLoginPage footer={<Footer />} />;
}
