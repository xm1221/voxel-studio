"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { htmlLang, readLocale, t, type Locale } from "@/lib/i18n";

function Booting() {
  const locale = useSyncExternalStore(
    () => () => {},
    () => readLocale(),
    (): Locale => "zh",
  );
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);
  return <div className="boot">{t(locale, "boot")}</div>;
}

const Studio = dynamic(() => import("@/components/studio").then((mod) => mod.Studio), {
  ssr: false,
  loading: () => <Booting />,
});

export default function Page() {
  return <Studio />;
}
