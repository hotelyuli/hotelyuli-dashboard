import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLogin) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(target);
  }

  if (user && isLogin) {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}
