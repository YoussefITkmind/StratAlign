import type { Metadata } from "next";

import PixelRagWorkspace from "@/components/pixelrag/PixelRagWorkspace";

export const metadata: Metadata = {
  title: "AI Intelligence · StratAlign",
};

export default function Page() {
  return <PixelRagWorkspace />;
}
