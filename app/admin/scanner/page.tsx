import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { getCurrentAdminAccess, hasPermission } from "@/lib/server/admin";
import AdminScanner from "@/components/AdminScanner";

export const dynamic = "force-dynamic";

export default async function AdminScannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth?next=/admin/scanner");
  const access = await getCurrentAdminAccess();
  if (!access || !hasPermission(access, "scan_tickets")) notFound();
  return <AdminScanner />;
}
