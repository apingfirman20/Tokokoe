import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Business, Branch, BusinessMember } from "@/types";
import { requireAuthenticatedUser, handleAuthApiError } from "@/lib/server/auth-guard";

export async function GET(request: Request) {
  try {
    const authUser = await requireAuthenticatedUser(request);

    const businessMap = new Map<string, Business>();

    // 1. Query businesses owned by this authenticated user
    const ownedSnapshot = await adminDb
      .collection("businesses")
      .where("ownerId", "==", authUser.uid)
      .get();

    ownedSnapshot.docs.forEach((doc) => {
      businessMap.set(doc.id, { id: doc.id, ...doc.data() } as Business);
    });

    // 2. Direct business from custom claims or staff login mapping
    if (authUser.businessId && !businessMap.has(authUser.businessId)) {
      try {
        const bizDoc = await adminDb.doc(`businesses/${authUser.businessId}`).get();
        if (bizDoc.exists) {
          businessMap.set(bizDoc.id, { id: bizDoc.id, ...bizDoc.data() } as Business);
        }
      } catch (bizFetchErr: any) {
        console.warn("Direct business lookup notice:", bizFetchErr.message);
      }
    }

    // 3. Query businesses where user is an employee/member
    try {
      const staffSnap = await adminDb.collection("staffLogins").where("uid", "==", authUser.uid).get();
      for (const sDoc of staffSnap.docs) {
        const bId = sDoc.data().businessId;
        if (bId && !businessMap.has(bId)) {
          const bizDoc = await adminDb.doc(`businesses/${bId}`).get();
          if (bizDoc.exists) {
            businessMap.set(bizDoc.id, { id: bizDoc.id, ...bizDoc.data() } as Business);
          }
        }
      }
    } catch (staffErr: any) {
      console.warn("Staff lookup notice:", staffErr.message);
    }

    try {
      const memberSnapshot = await adminDb
        .collectionGroup("members")
        .where("userId", "==", authUser.uid)
        .get();

      for (const mDoc of memberSnapshot.docs) {
        const mData = mDoc.data() as BusinessMember;
        if (mData.businessId && !businessMap.has(mData.businessId)) {
          const bizDoc = await adminDb.doc(`businesses/${mData.businessId}`).get();
          if (bizDoc.exists) {
            businessMap.set(bizDoc.id, { id: bizDoc.id, ...bizDoc.data() } as Business);
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
