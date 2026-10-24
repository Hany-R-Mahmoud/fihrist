import {
  AlertTriangle, Clock3, LockKeyhole, ShieldAlert, CircleHelp, FileQuestion,
  House, LogIn, ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ReasonEvidence={failureClass?:string|null;moveClass?:string|null};

/** Existing Lucide icons and inherited text color; no new visual badge family. */
export function HealthReasonIcon({failureClass,moveClass}:ReasonEvidence) {
  if(!failureClass && !moveClass)return null;
  let Icon:LucideIcon=CircleHelp;
  if(["dns","refused"].includes(failureClass??"")) Icon=AlertTriangle;
  else if(failureClass==="timeout") Icon=Clock3;
  else if(failureClass==="tls") Icon=LockKeyhole;
  else if(failureClass==="blocked") Icon=ShieldAlert;
  else if(failureClass==="soft_404") Icon=FileQuestion;
  else if(failureClass==="redirect_home" || moveClass==="to_home") Icon=House;
  else if(failureClass==="redirect_login" || moveClass==="to_login") Icon=LogIn;
  else if(["relocation","cross_domain"].includes(moveClass??""))Icon=ArrowUpRight;
  else if(moveClass==="canonical" || failureClass==="none") return null;
  return <Icon className="h-3.5 w-3.5 shrink-0" />;
}
