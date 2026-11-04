import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";
import PageViewTracker from "@/app/(site)/components/page-view-tracker";
import CartDrawer from "@/app/(site)/components/cart-drawer";
import { CartProvider } from "@/app/context/cart-context";

// Pages that can be prebuilt are rebuilt at most this often (seconds). Saves
// refresh them right away; this limit is so a page built during a database
// outage doesn't keep showing its fallback content for long (TZ-515).
export const revalidate = 300;

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-[#FAF7F2] text-stone-900 flex flex-col justify-between">
        <NavBar />
        <PageViewTracker />
        <div className="flex-1">{children}</div>
        <Footer />
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
