import type { Metadata } from "next";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { AdminClient } from "@/components/admin/admin-client";
import { getDictionary, locales, type Locale } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-context";

export const metadata: Metadata = {
  title: "Admin · StratAlign",
};

function resolveLocale(raw: string | undefined): Locale {
  return (locales as readonly string[]).includes(raw ?? "") ? (raw as Locale) : "en";
}

export default async function AdminPage() {
  const session = await auth();

  if (session?.user?.role !== "platform_administrator") {
    const cookieStore = await cookies();
    const dict = getDictionary(resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value));
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <h1 className="text-[1.1rem] font-bold text-red-800">{dict.admin.accessDenied}</h1>
        <p className="mt-1.5 text-[13px] text-red-700">{dict.admin.accessDeniedBody}</p>
      </div>
    );
  }

  return <AdminClient />;
}
