import SiteHeader from "@/components/SiteHeader";
import AuthExperience from "@/components/AuthExperience";

export default function AuthPage() {
  return <main className="inner-page auth-page"><SiteHeader /><section className="auth-shell"><div className="section-label">AGAYO ID / АВТОРИЗАЦИЯ</div><AuthExperience /></section></main>;
}
