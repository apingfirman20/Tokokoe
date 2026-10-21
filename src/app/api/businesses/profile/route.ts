import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { Business } from "@/types";
import { requireAuthenticatedUser, requireBusinessPermission, handleAuthApiError } from "@/lib/server/auth-guard";

const receiptSettingsSchema = z.object({
  showLogo: z.boolean().optional(),
  logoUrl: z.string().optional(),
  storeName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  tagline: z.string().optional(),
  footerMessage: z.string().optional(),
  footerNotes: z.string().optional(),
  showCashier: z.boolean().optional(),
  showCustomer: z.boolean().optional(),
  showTax: z.boolean().optional(),
  paperSize: z.enum(["80mm", "58mm"]).optional(),
  customHeaderNote: z.string().optional(),
  showTableOrService: z.boolean().optional(),
  showImeiDetails: z.boolean().optional(),
  showItemBarcode: z.boolean().optional(),
}).optional();

const midtransSettingsSchema = z.object({
  isEnabled: z.boolean().default(false),
  isProduction: z.boolean().default(false),
  merchantId: z.string().trim().optional(),
  clientKey: z.string().trim().optional(),
  serverKey: z.string().trim().optional(),
  allowTableQris: z.boolean().default(true).optional(),
}).optional();

const updateProfileSchema = z.object({
  businessId: z.string().min(1, "businessId wajib diisi"),
  name: z.string().trim().min(1, "Nama usaha wajib diisi").max(100),
  phone: z.string().trim().default(""),
  address: z.string().trim().default(""),
  logoUrl: z.string().trim().optional(),
  receiptSettings: receiptSettingsSchema,
  midtransSettings: midtransSettingsSchema,
});

export async function PUT(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "Data profil bisnis tidak valid" },
        { status: 400 }
      );
    }

    const { businessId, name, phone, address, logoUrl, receiptSettings, midtransSettings } = parsed.data;

    // Check authority: caller must be owner or manager with business.settings.manage
    await requireBusinessPermission(businessId, authUser.uid, "business.settings.manage");

    const bizRef = adminDb.doc(`businesses/${businessId}`);
    const bizSnap = await bizRef.get();

    if (!bizSnap.exists) {
      return NextResponse.json({ success: false, message: "Bisnis tidak ditemukan." }, { status: 404 });
    }

    const updates: Record<string, any> = {
      name,
      phone,
      address,
      updatedAt: Date.now(),
    };

    if (logoUrl !== undefined) {
      updates.logoUrl = logoUrl;
    }
    if (receiptSettings !== undefined) {
      updates.receiptSettings = receiptSettings;
    }
    if (midtransSettings !== undefined) {
      updates.midtransSettings = midtransSettings;
    }

    await bizRef.update(updates);

    const updatedSnap = await bizRef.get();
    const updatedBiz = { id: updatedSnap.id, ...updatedSnap.data() } as Business;

    return NextResponse.json({
      success: true,
      business: updatedBiz,
      message: "Profil usaha berhasil diperbarui dan tersimpan di server.",
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
