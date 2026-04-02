import NavBar from "@/app/(site)/components/nav-bar";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <NavBar />
      {children}
    </div>
  );
}