import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";
import PageViewTracker from "@/app/(site)/components/page-view-tracker";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <NavBar />
      <PageViewTracker />
      {children}
      <Footer />
    </div>
  );
}
