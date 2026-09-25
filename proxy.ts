import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Icons, the web app manifest, sw.js and its offline page must load without a session
  // (phones fetch them without cookies; a redirected sw.js fails to register).
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|ico|jpg|jpeg|gif|webp)$).*)"]
};
