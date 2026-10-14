"use client";

import dynamic from "next/dynamic";

const Studio = dynamic(() => import("@/components/studio").then((mod) => mod.Studio), {
  ssr: false,
  loading: () => <div className="boot">正在摆好棚灯…</div>,
});

export default function Page() {
  return <Studio />;
}
