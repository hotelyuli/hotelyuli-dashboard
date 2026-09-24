import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Icons and the web app manifest must load without a session (phones fetch them without cookies).
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|manifest.webmanifest|.*\\.(?:svg|png|ico|jpg|jpeg|gif|webp)$).*)"]
};
