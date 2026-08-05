// app/(app)/[...catchAll]/page.tsx
//
// Route groups like (app) don't add a URL segment, so Next.js can't
// automatically nest a fully-unmatched path (e.g. a sidebar link to a page
// that doesn't have a folder yet) under (app)/layout.tsx's not-found
// boundary — it falls straight to the root 404 instead, blanking the whole
// screen including the Sidebar/AppNav. This catch-all gives every such path
// a real match under this group, so it renders inside the persistent chrome
// with just the content area blank. Once a real
// app/(app)/<route>/page.tsx exists, Next.js matches that instead.

export default function AppCatchAll() {
  return <div className="min-h-screen w-full bg-white" />;
}
