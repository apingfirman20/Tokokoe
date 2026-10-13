import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tokokoe-16bab";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    // Strip quotes if accidentally wrapped
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  // Fallback: Check for service-account.json file in local environment
  try {
    const fs = require("fs");
    const path = require("path");
    const saPath = path.join(process.cwd(), "service-account.json");
    if (fs.existsSync(saPath)) {
      const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
      return initializeApp({
        credential: cert(sa),
      });
    }
  } catch {
    // Continue to default
  }

  // Fallback for local development
  return initializeApp({
    projectId,
  });

}

export const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
adminDb.settings({ ignoreUndefinedProperties: true });
