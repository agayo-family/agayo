import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return <main className="inner-page checkout-success-page"><SiteHeader /><section className="checkout-success-shell"><div className="section-label">ОПЛАТА / AGAYO</div><span className="checkout-success-mark">✓</span><h1>ПЛАТЁЖ<br />ПРОВЕРЯЕТСЯ</h1><p>Если ЮKassa подтвердила оплату, билет будет выпущен автоматически, сохранён в AGAYO ID и отправлен на почту из заказа. Обычно это занимает несколько секунд.</p>{order ? <div className="checkout-success-order"><span>ЗАКАЗ</span><strong>{order}</strong></div> : null}<div className="checkout-success-actions"><Link href="/profile" className="button-link">Открыть AGAYO ID <b>↗</b></Link><Link href="/events" className="text-link">К мероприятиям</Link></div></section></main>;
}
