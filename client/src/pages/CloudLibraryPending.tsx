import { Bookmark, ShieldCheck, ArrowLeft, Database } from "lucide-react";
export default function CloudLibraryPending() {
  return <main className="min-h-screen bg-[#f7f6f1] px-5 py-16 text-[#17362d]">
    <div className="mx-auto max-w-xl">
      <a href="/" className="mb-16 inline-flex items-center gap-2 text-sm font-semibold hover:underline"><ArrowLeft className="h-4 w-4"/> Fihrist home</a>
      <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[#17362d] text-[#f7f6f1]"><Bookmark className="h-7 w-7"/></span>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#648274]">Private library</p>
      <h1 className="mb-5 text-4xl font-semibold leading-tight tracking-[-0.05em]">Your bookmark library is being prepared.</h1>
      <p className="mb-7 text-base leading-7 text-[#51665a]">We're setting up secure Google sign-in and a private Neon-backed database before opening the cloud library. The public site is live, but your personal bookmarks are not hosted here yet.</p>
      <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-[#dce5d9] bg-white p-5 text-sm text-[#395849]">
        <p className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#2a714b]"/> No public access to private bookmarks</p>
        <p className="flex items-center gap-3"><Database className="h-5 w-5 text-[#2a714b]"/> Existing local SQLite data stays unchanged</p>
      </div>
      <a href="/" className="inline-flex rounded-xl bg-[#17362d] px-5 py-3 text-sm font-semibold text-white">Return home</a>
      <p className="mt-12 text-xs text-[#64796b]"><a href="/privacy.html" className="underline">Privacy Policy</a> · <a href="/terms.html" className="underline">Terms of Use</a></p>
    </div>
  </main>;
}
