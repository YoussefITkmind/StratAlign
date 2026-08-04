import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import { LocaleProvider, LOCALE_COOKIE } from "@/lib/i18n/locale-context";
import { locales, type Locale } from "@/lib/i18n/dictionaries";
import { TRPCProvider } from "@/lib/trpc/Provider";

export const metadata: Metadata = {
  title: "StratAlign",
  description: "Strategic Performance Management Platform",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

function resolveLocale(raw: string | undefined): Locale {
  return (locales as readonly string[]).includes(raw ?? "") ? (raw as Locale) : "en";
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <TRPCProvider>{children}</TRPCProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
