// app/(app)/not-found.tsx
//
// Renders inside (app)/layout.tsx's {children} slot, so the Sidebar and
// AppNav stay on screen for routes under this group that don't have a
// page.tsx yet — only the content area goes blank. As soon as a real
// app/(app)/<route>/page.tsx exists, Next.js renders that instead.

export default function AppNotFound() {
  return <div className="min-h-screen w-full bg-white" />;
}
