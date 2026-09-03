import { notFound, redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { getCurrentUser } from "@/lib/server/auth";
import { getCurrentAdminAccess } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth?next=/admin");

  const access = await getCurrentAdminAccess();
  if (!access) notFound();

  return <AdminDashboard access={access} />;
}
