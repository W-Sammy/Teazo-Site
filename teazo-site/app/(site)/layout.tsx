import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <NavBar />
      {children}
      <Footer />
    </div>
  );
}