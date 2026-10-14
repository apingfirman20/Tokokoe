import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Business, Branch, BusinessMember } from "@/types";
import { requireAuthenticatedUser, handleAuthApiError } from "@/lib/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);

    const businessMap = new Map<string, Business>();

    // 1. Query businesses owned by this authenticated user (must be active)
    const ownedSnapshot = await adminDb
      .collection("businesses")
      .where("ownerId", "==", authUser.uid)
      .get();

    ownedSnapshot.docs.forEach((doc) => {
      const data = doc.data() as Business;
      if (data.status !== 'inactive' && data.status !== 'suspended') {
        businessMap.set(doc.id, { ...data, id: doc.id });
      }
    });

    // 2. Validate claim businessId against LIVE membership record (Never trust stale claims)
    if (authUser.businessId && !businessMap.has(authUser.businessId)) {
      try {
        const memberDoc = await adminDb.doc(`businesses/${authUser.businessId}/members/${authUser.uid}`).get();
        if (memberDoc.exists && memberDoc.data()?.status === 'active') {
          const bizDoc = await adminDb.doc(`businesses/${authUser.businessId}`).get();
          if (bizDoc.exists) {
            const bizData = bizDoc.data() as Business;
            if (bizData.status !== 'inactive' && bizData.status !== 'suspended') {
              businessMap.set(bizDoc.id, { ...bizData, id: bizDoc.id });
            }
          }
        }
      } catch (bizFetchErr: any) {
        console.warn("Direct business verification notice:", bizFetchErr.message);
      }
    }

    // 3. Query businesses where user is an active employee mapped in staffLogins
    try {
      const staffSnap = await adminDb
        .collection("staffLogins")
        .where("uid", "==", authUser.uid)
        .where("status", "==", "active")
        .get();

      for (const sDoc of staffSnap.docs) {
        const bId = sDoc.data().businessId;
        if (bId && !businessMap.has(bId)) {
          // Verify live membership in that business
          const memberDoc = await adminDb.doc(`businesses/${bId}/members/${authUser.uid}`).get();
          if (memberDoc.exists && memberDoc.data()?.status === 'active') {
            const bizDoc = await adminDb.doc(`businesses/${bId}`).get();
            if (bizDoc.exists) {
              const bizData = bizDoc.data() as Business;
              if (bizData.status !== 'inactive' && bizData.status !== 'suspended') {
                businessMap.set(bizDoc.id, { ...bizData, id: bizDoc.id });
              }
            }
          }
        }
      }
    } catch (staffErr: any) {
      console.warn("Staff lookup notice:", staffErr.message);
    }

    // 4. Query live active business members collectionGroup
    try {
      const memberSnapshot = await adminDb
        .collectionGroup("members")
        .where("userId", "==", authUser.uid)
        .where("status", "==", "active")
        .get();

      for (const mDoc of memberSnapshot.docs) {
        const mData = mDoc.data() as BusinessMember;
        if (mData.businessId && !businessMap.has(mData.businessId)) {
          const bizDoc = await adminDb.doc(`businesses/${mData.businessId}`).get();
          if (bizDoc.exists) {
            const bizData = bizDoc.data() as Business;
            if (bizData.status !== 'inactive' && bizData.status !== 'suspended') {
              businessMap.set(bizDoc.id, { ...bizData, id: bizDoc.id });
            }
          }
        }
      }
    } catch (memberQueryErr: any) {
      console.warn("Member query notice:", memberQueryErr.message);
    }

    const businesses = Array.from(businessMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Fetch branches for each business
    const branchMap: Record<string, Branch[]> = {};
    for (const biz of businesses) {
      try {
        const branchesSnap = await adminDb.collection(`businesses/${biz.id}/branches`).get();
        branchMap[biz.id] = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
      } catch (brErr) {
        branchMap[biz.id] = [];
      }
    }

    return NextResponse.json({
      success: true,
      businesses,
      branches: Object.values(branchMap).flat(),
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
