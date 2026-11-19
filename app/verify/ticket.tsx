"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { BadgeCheck, CalendarDays, CircleAlert, ImagePlus, MapPin, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { readQr, readToken } from "../../lib/pass-code";
import type { TicketVerification } from "../../lib/pass-code";
import { decodeFile } from "../../lib/qr-image";

type View = { status: "idle" | "loading" } | TicketVerification;
type Status = View["status"];
const messages: Record<Status, [string,string]> = {
  idle:["Verify your ticket","Open the link from your ticket’s QR code, or upload an image of your ticket below."],
  loading:["Checking your ticket…",""],
  valid:["Valid ticket","Present your printed ticket or digital copy at the entrance."],
  used:["Already checked in","This ticket has already been used for entry."],
  invalid:["Ticket could not be verified","Scan the original QR code or ask the organizer to check your ticket."],
  unavailable:["Verification is unavailable","Check your connection and try again."],
};

export default function VerifyTicket() {
  const [view,setView] = useState<View>({ status: "idle" });
  const { status } = view;
  const [imageError,setImageError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const current = useRef(0);
  const lastToken = useRef<string | null>(null);

  const verify = useCallback(async (token: string | null) => {
    const attempt = ++current.current;
    setImageError("");
    if (!token) { setView({ status: "invalid" }); return; }
    lastToken.current = token;
    setView({ status: "loading" });
    try {
      const response = await fetch("/api/verify", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}),
      });
      const result = await response.json() as Partial<{ status: Status; name: string; serial: string }>;
      if (attempt !== current.current) return;
      if ((result.status === "valid" || result.status === "used") &&
          typeof result.name === "string" && typeof result.serial === "string") {
        setView({ status: result.status, name: result.name, serial: result.serial });
      } else {
        setView({ status: result.status === "invalid" ? "invalid" : "unavailable" });
      }
    } catch {
      if (attempt === current.current) setView({ status: "unavailable" });
    }
  }, []);

  useEffect(() => {
    const checkLink = () => {
      const raw = window.location.hash.slice(1);
      if (raw) void verify(readToken(raw));
      else { current.current++; setView({ status: "idle" }); }
    };
    checkLink();
    window.addEventListener("hashchange",checkLink);
    return () => {
      current.current++;
      window.removeEventListener("hashchange",checkLink);
    };
  },[verify]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (!image) return;
    const attempt = ++current.current;
    setImageError("");
    setView({ status: "loading" });
    try {
      const code = await decodeFile(image);
      if (attempt !== current.current) return;
      if (!code) {
        setView({ status: "idle" });
        setImageError("No QR code found. Try a sharper photo or screenshot.");
        return;
      }
      await verify(readQr(code,window.location.origin));
    } catch {
      if (attempt !== current.current) return;
      setView({ status: "idle" });
      setImageError("Could not read this image. Try a PNG or JPEG.");
    }
  }

  const result = status === "valid" || status === "used" || status === "invalid" || status === "unavailable";

  return <div className="verify-site">
    <header className="topbar"><div className="top-inner">
      <a className="brand" href="/verify"><span className="brand-icon"><Sparkles size={19}/></span><span>The Last <em>Soirée</em></span></a>
      <a className="organizer-link" href="/admin"><ShieldCheck size={16}/> Organizer sign-in</a>
    </div></header>
    <main className="verify-shell">
      <section className="hero">
        <div className="hero-art"/>
        <div className="hero-content">
          <p className="eyebrow"><span/> DPSB AFTER PARTY</p>
          <h1>The Last <i>Soirée.</i></h1>
          <p className="hero-copy">One last evening before the next chapter.</p>
          <div className="event"><span><CalendarDays size={16}/> 28 December</span><span><MapPin size={16}/> Studio XO, Kanpur</span></div>
        </div>
      </section>
      <section className="card verify-card" aria-live="polite">
        <div className={"verify-result"+(result ? " verify-"+status : "")}>
          <span className="small-icon">
            {status === "valid" ? <BadgeCheck size={23}/> :
              result ? <CircleAlert size={22}/> : <QrCode size={22}/>}
          </span>
          <div><h2>{messages[status][0]}</h2>{messages[status][1] && <p>{messages[status][1]}</p>}</div>
        </div>
        {"name" in view && <dl className="verified-identity">
          <div><dt>Guest name</dt><dd>{view.name}</dd></div>
          <div><dt>Pass number</dt><dd>{view.serial}</dd></div>
        </dl>}
        {imageError && <p className="alert" role="alert">{imageError}</p>}
        <div className="verify-actions">
          <button className="primary" disabled={status==="loading"} onClick={()=>file.current?.click()}><ImagePlus size={17}/> Upload a QR image</button>
          {status === "unavailable" && lastToken.current && <button className="secondary" onClick={()=>void verify(lastToken.current)}>Try again</button>}
          <input ref={file} type="file" accept="image/*" onChange={upload} hidden/>
        </div>
      </section>
    </main>
  </div>;
}
