"use client";
import { assertUploadFile, type UploadPurpose } from "@/lib/upload-policy";

export async function uploadAdminFile(file: File, purpose: UploadPurpose, eventSlug?: string) {
  assertUploadFile(file, purpose);
  const { upload } = await import("@vercel/blob/client");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.+/g, ".").slice(-140);
  const extension = safeName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "file";
  const stem = safeName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-") || "media";
  return upload(`agayo/uploads/${purpose}/${crypto.randomUUID()}-${stem}.${extension}`, file, {
    access: "public", handleUploadUrl: "/api/admin/blob/upload", contentType: file.type,
    clientPayload: JSON.stringify({ purpose, eventSlug: eventSlug || null }),
  });
}
