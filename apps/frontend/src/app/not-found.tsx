// app/not-found.tsx
//
// Renders inside the root layout's {children} slot, so the Sidebar (and any
// other persistent chrome in app/layout.tsx) stays on screen. Only the
// content area goes blank. As soon as a real app/<route>/page.tsx exists,
// Next.js renders that instead of this — no changes needed here.

export default function NotFound() {
  return <div className="min-h-screen w-full bg-white" />;
}
