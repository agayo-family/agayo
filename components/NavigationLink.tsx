"use client";
import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

function Progress() {
  const { pending } = useLinkStatus();
  return pending ? <span className="nav-loading-bar" role="status" aria-label="Загружаем страницу"><i /></span> : null;
}
export default function NavigationLink({ href, children, prefetch=true }: { href: string; children: ReactNode; prefetch?: boolean }) {
  return <Link href={href} prefetch={prefetch}>{children}<Progress /></Link>;
}
