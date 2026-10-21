import React, { FormEvent, useEffect, useState } from "react";
import { Bookmark, Loader2, LockKeyhole, Mail } from "lucide-react";
import { neonAuth, useCloudSession } from "@/lib/neonAuth";
import { enterGuestMode, leaveGuestMode } from "@/lib/guestLibrary";

const googleReady = import.meta.env.VITE_GOOGLE_OAUTH_READY === "true";

export default function CloudSignIn() {
  const session = useCloudSession();
  useEffect(() => {
    if (session.data?.user) {
      leaveGuestMode();
      window.location.replace("/library");
    }
  }, [session.data?.user]);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [name,setName] = useState("");
  const [signUp,setSignUp] = useState(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState("");
  const [googlePending,setGooglePending] = useState(false);

  async function emailLogin(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      const result = signUp
        ? await neonAuth.signUp.email({email,password,name:name.trim() || email.split("@")[0]})
        : await neonAuth.signIn.email({email,password});
      if (result.error) throw new Error(result.error.message || "Authentication failed");
      leaveGuestMode();
      window.location.assign("/library");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not authenticate");
    } finally {setPending(false);}
  }

  async function googleLogin() {
    if (!googleReady) return;
    setMessage("");
    setGooglePending(true);
    try {
      const result = await neonAuth.signIn.social({provider:"google",callbackURL:window.location.origin+"/library",disableRedirect:true});
      if (result.error) throw new Error(result.error.message || "Google sign-in is unavailable");
      if (!result.data?.url) throw new Error("Google sign-in did not return a redirect URL");
      // Clear only the mode flag before navigation; the IndexedDB library stays intact.
      leaveGuestMode();
      window.location.assign(result.data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in is not configured");
      setGooglePending(false);
    }
  }

  return <main className="fihrist-app fihrist-auth min-h-screen bg-background px-5 py-16 text-foreground">
    <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-9">
      <a href="/" className="mb-10 inline-flex items-center gap-2 text-xl font-semibold"><Bookmark className="h-6 w-6" aria-hidden="true" /> Fihrist</a>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Private bookmark library</p>
      <h1 className="fihrist-display mb-3 text-3xl font-semibold tracking-tight">Your bookmarks, across devices.</h1>
      <p className="mb-7 text-sm leading-6 text-muted-foreground">Sign in to access your private library across devices. Guest bookmarks stay on this device and are never automatically uploaded.</p>
      <button type="button" onClick={googleLogin} disabled={!googleReady || googlePending || pending}
        className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold hover:bg-muted disabled:opacity-50">
        {googlePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />} Continue with Google
      </button>
      {!googleReady && <p className="mb-3 text-xs leading-5 text-muted-foreground">Google sign-in is not available yet. You can still create an email account or try Guest Mode.</p>}
      <button type="button" onClick={enterGuestMode} className="mb-3 h-11 w-full rounded-xl border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted">Continue as Guest — saved on this device</button>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> or email sign-in <span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={emailLogin} className="space-y-3">
        {signUp && <label className="block text-sm font-medium">Name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="fihrist-input mt-1 h-11 w-full rounded-xl border px-3" autoComplete="name" /></label>}
        <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="fihrist-input mt-1 h-11 w-full rounded-xl border px-3" autoComplete="email" /></label>
        <label className="block text-sm font-medium">Password<input required type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="fihrist-input mt-1 h-11 w-full rounded-xl border px-3" autoComplete={signUp?"new-password":"current-password"} /></label>
        {message && <p role="alert" className="fihrist-danger rounded-lg border px-3 py-2 text-sm">{message}</p>}
        <button disabled={pending||googlePending} type="submit" className="fihrist-primary-action flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}{signUp?"Create account":"Sign in with email"}</button>
      </form>
      <button type="button" onClick={()=>{setSignUp(x=>!x);setMessage("");}} className="mt-5 w-full text-center text-sm font-medium text-primary underline">{signUp?"Already have an account? Sign in":"New here? Create an account"}</button>
      <p className="mt-9 text-xs leading-5 text-muted-foreground">Cloud access requires a signed-in account. <a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/terms.html">Terms</a></p>
    </section>
  </main>;
}
