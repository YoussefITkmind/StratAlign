import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh overflow-y-auto bg-white">{children}</div>;
}
