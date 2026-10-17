import { FormEvent, useState } from "react";
import { Bookmark, Loader2, LockKeyhole, Mail } from "lucide-react";
import { neonAuth } from "@/lib/neonAuth";
import { enterGuestMode } from "@/lib/guestLibrary";

const googleReady = import.meta.env.VITE_GOOGLE_OAUTH_READY === "true";

export default function CloudSignIn() {
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
      const result = await neonAuth.signIn.social({provider:"google",callbackURL:window.location.origin+"/library"});
      if (result.error) throw new Error(result.error.message || "Google sign-in is unavailable");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in is not configured");
      setGooglePending(false);
    }
  }

  return <main className="fihrist-app min-h-screen bg-[#f7f6f1] px-5 py-16 text-[#17362d]">
    <section className="mx-auto w-full max-w-md rounded-3xl border border-[#d7e2d4] bg-white p-6 shadow-sm sm:p-9">
      <a href="/" className="mb-10 inline-flex items-center gap-2 text-xl font-semibold"><Bookmark className="h-6 w-6"/> Fihrist</a>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#587864]">Private bookmark library</p>
      <h1 className="mb-3 text-3xl font-semibold tracking-tight">Your bookmarks, across devices.</h1>
      <p className="mb-7 text-sm leading-6 text-[#566b60]">Sign in to access your private Neon-backed library. Your existing local SQLite library is preserved separately.</p>
      <button type="button" onClick={googleLogin} disabled={!googleReady || googlePending || pending}
        className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#bdcec1] bg-[#f6f8f5] font-semibold hover:bg-[#eaf0e9] disabled:opacity-50">
        {googlePending ? <Loader2 className="h-4 w-4 animate-spin"/> : <LockKeyhole className="h-4 w-4"/>} Continue with Google
      </button>
      {!googleReady && <p className="mb-3 text-xs leading-5 text-[#536b5a]">Google sign-in is not available yet. You can still create an email account or try Guest Mode.</p>}
      <button type="button" onClick={enterGuestMode} className="mb-3 h-11 w-full rounded-xl border border-[#bdcec1] bg-white text-sm font-semibold text-[#17362d] hover:bg-[#f1f5ef]">Continue as Guest — saved on this device</button>
      <div className="my-6 flex items-center gap-3 text-xs text-[#718278]"><span className="h-px flex-1 bg-[#dbe5dc]"/> or email sign-in <span className="h-px flex-1 bg-[#dbe5dc]"/></div>
      <form onSubmit={emailLogin} className="space-y-3">
        {signUp && <label className="block text-sm font-medium">Name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#bdcec1] px-3" autoComplete="name"/></label>}
        <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#bdcec1] px-3" autoComplete="email"/></label>
        <label className="block text-sm font-medium">Password<input required type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#bdcec1] px-3" autoComplete={signUp?"new-password":"current-password"}/></label>
        {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
        <button disabled={pending||googlePending} type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17362d] font-semibold text-white disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4"/>}{signUp?"Create account":"Sign in with email"}</button>
      </form>
      <button type="button" onClick={()=>{setSignUp(x=>!x);setMessage("");}} className="mt-5 w-full text-center text-sm font-medium text-[#315e44] underline">{signUp?"Already have an account? Sign in":"New here? Create an account"}</button>
      <p className="mt-9 text-xs leading-5 text-[#697a70]">Cloud access requires a verified account. <a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/terms.html">Terms</a></p>
    </section>
  </main>;
}
