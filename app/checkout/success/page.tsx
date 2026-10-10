import SiteHeader from "@/components/SiteHeader";
import CheckoutStatus from "@/components/CheckoutStatus";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return (
    <main id="main-content" className="inner-page checkout-success-page">
      <SiteHeader />
      <CheckoutStatus orderPublicId={order} />
    </main>
  );
}
