import SiteHeader from "@/components/SiteHeader";
import AuthExperience from "@/components/AuthExperience";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <main className="inner-page auth-page"><SiteHeader /><section className="auth-shell"><div className="section-label">AGAYO ID / АВТОРИЗАЦИЯ</div><AuthExperience nextPath={params.next || "/profile"} /></section></main>;
}
