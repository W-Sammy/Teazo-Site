import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";
import PageViewTracker from "@/app/(site)/components/page-view-tracker";
import CartDrawer from "@/app/(site)/components/cart-drawer";
import { CartProvider } from "@/app/context/cart-context";

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
