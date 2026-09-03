import AdminDashboard from "@/components/AdminDashboard";
import { ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
export const dynamic="force-dynamic";
export default function AdminPreview(){const access={userId:"preview",agayoId:"AGY-PREVIEW",email:"owner@preview.agayo",displayName:"AGAYO OWNER",role:"owner" as const,permissions:ADMIN_PERMISSIONS.map(x=>x.id),allEvents:true,eventSlugs:[],bootstrapOwner:true};return <AdminDashboard access={access} previewMode/>}
