"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { Activity, BadgeCheck, CalendarDays, Camera, Check, CircleAlert, Clock3, Download, ImagePlus, Link2, List, MapPin, Plus, QrCode, ScanLine, Search, ShieldCheck, Sparkles, Ticket, Users, X } from "lucide-react";
import { decode, decodeFile } from "../../lib/qr-image";
import { passNumber, readQr, ticketLink } from "../../lib/pass-code";
import { download, downloadPrintSheet, downloadTicket, ticketsPerSheet } from "../../lib/print-passes";

type Pass = { id: number; name: string; token: string; createdAt: string; admittedAt: string | null; cancelledAt: string | null };
type Result = { pass: Pass | null; admittedNow?: boolean; code: string };
type Screen = "check" | "passes";
const timestamp = (date: string) => new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata", hour:"numeric", minute:"2-digit", hour12:true}).format(new Date(date));
const stateOf = (p: Pass) => p.cancelledAt ? "Cancelled" : p.admittedAt ? "Checked in" : "Ready";
async function api<T = unknown>(body?: object): Promise<T> {
  const response = await fetch("/api/passes", body ? {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  } : {cache:"no-store"});
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function exportList(passes: Pass[]) {
  const escape = (value: string) => {
    const safe = /^\s*[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = passes.map(p => [passNumber(p.id),p.name,stateOf(p),p.admittedAt ? timestamp(p.admittedAt) : ""].map(escape).join(","));
  const url = URL.createObjectURL(new Blob(["\uFEFFPass,Guest,Status,Check-in time (IST)\r\n", rows.join("\r\n")], {type:"text/csv;charset=utf-8"}));
  download(url, "DPSB-Door-List.csv");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [screen,setScreen] = useState<Screen>("check");
  const [passes,setPasses] = useState<Pass[]>([]);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [name,setName] = useState("");
  const [query,setQuery] = useState("");
  const [result,setResult] = useState<Result | null>(null);
  const [busy,setBusy] = useState(false);
  const [camera,setCamera] = useState(false);
  const [opening,setOpening] = useState(false);
  const [issueOpen,setIssueOpen] = useState(false);
  const [printing,setPrinting] = useState(false);
  const [confirmation,setConfirmation] = useState<Pass | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ passes: Pass[] }>();
      setPasses(data.passes);
      setLoadError("");
    } catch (err) {
      setLoadError((err as Error).message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); },15000);
    return () => clearInterval(timer);
  },[refresh]);

  const stopCamera = useCallback(() => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setOpening(false);
    setCamera(false);
  }, []);
  useEffect(() => () => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  const check = useCallback(async (raw: string, admit = false) => {
    const value = readQr(raw,window.location.origin);
    if (!value) {
      setError("This QR code is not a pass for The Last Soirée.");
      setResult(null);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    if (!admit) setResult(null);
    try {
      const data = await api<Omit<Result, "code">>({action:admit ? "admit" : "check",code:value.slice(0,200)});
      setResult({...data, code:value});
      if (admit) await refresh();
    } catch(err) { setError((err as Error).message); }
    finally { setBusy(false); }
  },[refresh]);

  useEffect(() => {
    if (!camera) return;
    const element = video.current;
    if (!element) return;
    element.srcObject = stream.current;
    void element.play().catch(() => {
      stopCamera();
      setError("The camera could not start. Upload an image of the QR instead.");
    });
    const timer = setInterval(() => {
      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const value = decode(element,element.videoWidth,element.videoHeight);
      if (value) { stopCamera(); void check(value); }
    }, 230);
    return () => clearInterval(timer);
  },[camera,check,stopCamera]);

  async function startCamera() {
    setError("");
    setNotice("");
    setOpening(true);
    const attempt = ++cameraRequest.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const media = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      if (attempt !== cameraRequest.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
    } catch {
      if (attempt === cameraRequest.current) setError("Camera access is unavailable. Upload an image of the QR instead.");
    } finally {
      if (attempt === cameraRequest.current) setOpening(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (!image) return;
    setError("");
    setNotice("");
    setResult(null);
    stopCamera();
    try {
      const value = await decodeFile(image);
      if (value) await check(value);
      else setError("No QR code found. Try a clearer image.");
    } catch {
      setError("Could not read this image. Try a PNG, JPEG, or screenshot.");
    }
  }

  async function issue(event: FormEvent) {
    event.preventDefault();
    const names = name.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!names.length) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const {passes: issued} = await api<{passes:Pass[]}>({action:"issue",names});
      setName("");
      setIssueOpen(false);
      setNotice(issued.length === 1 ? passNumber(issued[0].id) + " issued for " + issued[0].name + "." : issued.length + " passes issued.");
      await refresh();
    } catch(err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function updatePass(pass: Pass) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api({action:pass.cancelledAt ? "restore" : "cancel",id:pass.id});
      setNotice(passNumber(pass.id) + (pass.cancelledAt ? " restored." : " cancelled."));
      setConfirmation(null);
      await refresh();
    } catch(err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function choose(next: Screen) {
    if (camera || opening) stopCamera();
    setScreen(next);
    setError("");
    setNotice("");
  }

  const active = passes.filter(pass => !pass.cancelledAt);
  const checked = active.filter(pass => pass.admittedAt);
  const latest = [...checked].sort((a,b) => (b.admittedAt ?? "").localeCompare(a.admittedAt ?? "")).slice(0,3);
  async function printPasses() {
    setError("");
    setPrinting(true);
    try {
      const {passes: current} = await api<{passes:Pass[]}>();
      await downloadPrintSheet(current.filter(pass => !pass.cancelledAt));
    } catch(err) {
      setError((err as Error).message);
    } finally { setPrinting(false); }
  }

  async function copyLink(pass: Pass) {
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(ticketLink(pass.token,window.location.origin));
      setNotice("Verification link copied for " + passNumber(pass.id) + ".");
    } catch {
      setError("Could not copy the link. Download the ticket image to share its QR.");
    }
  }

  async function saveTicket(pass: Pass) {
    setError("");
    try { await downloadTicket(pass); }
    catch(err) { setError((err as Error).message); }
  }

  const filtered = passes.filter(pass => !query.trim() || (pass.name + " " + passNumber(pass.id)).toLowerCase().includes(query.trim().toLowerCase()));
  const state = !result ? "" : result.admittedNow ? "done" : result.pass?.cancelledAt ? "cancelled" :
    result.pass?.admittedAt ? "used" : result.pass ? "valid" : "invalid";
  const stateTitle: Record<string,string> = {done:"Checked in",cancelled:"Cancelled pass",used:"Already checked in",valid:"Valid pass",invalid:"Pass not recognized"};

  return <>
    <header className="topbar">
      <div className="top-inner">
        <button className="brand" onClick={() => choose("check")} aria-label="The Last Soirée home"><span className="brand-icon"><Sparkles size={19}/></span><span>The Last <em>Soirée</em></span></button>
        <nav aria-label="Main">
          <button className={screen==="check" ? "selected" : ""} aria-current={screen==="check" ? "page" : undefined} onClick={() => choose("check")}><ScanLine size={17}/> Check in</button>
          <button className={screen==="passes" ? "selected" : ""} aria-current={screen==="passes" ? "page" : undefined} onClick={() => choose("passes")}><List size={17}/> Guest passes</button>
        </nav>
        <form action="/api/session" method="post"><input type="hidden" name="action" value="signout"/><button className="secondary" type="submit">Sign out</button></form>
      </div>
    </header>
    <main className="shell">
      <section className="hero">
        <div className="hero-art" />
        <div className="hero-content">
          <p className="eyebrow"><span/> ENTRANCE MANAGEMENT</p>
          <h1>{screen === "check" ? <>Pass <i>check-in.</i></> : <>Guest <i>passes.</i></>}</h1>
          <p className="hero-copy">{screen === "check" ? "Verify tickets and welcome guests at the door." : "Issue and manage your printed and digital passes."}</p>
          <div className="event"><span><CalendarDays size={16}/> 28 December</span><span><MapPin size={16}/> Studio XO, Kanpur</span></div>
        </div>
      </section>
      {loadError && <div className="alert" role="alert"><CircleAlert size={18}/> {loadError} <button className="text-button" onClick={() => void refresh()}>Retry</button></div>}
      {screen === "check" ? <div className="dashboard">
        <section className="card scanner">
          <div className="card-heading"><span className="small-icon"><ScanLine size={21}/></span><div><h2>Verify a pass</h2><p>Scan a printed pass or a digital copy.</p></div></div>
          <div className={"scan-area"+(camera ? " camera-active" : "")}>
            {camera ? <>
              <video ref={video} muted playsInline aria-label="Live camera for scanning passes"/>
              <div className="viewfinder"><span/><span/><span/><span/></div>
              <button className="stop" onClick={stopCamera}><X size={16}/> Stop camera</button>
            </> : <>
              <div className="scan-mark"><i/><i/><i/><i/><QrCode size={35} strokeWidth={1.25}/></div>
              <div className="scan-actions">
                <button className="primary" disabled={busy || opening} onClick={() => void startCamera()}><Camera size={17}/> {opening ? "Opening camera…" : "Start camera"}</button>
                <button className="secondary" disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={17}/> Upload QR</button>
              </div>
            </>}
            <input ref={file} type="file" accept="image/*" onChange={upload} hidden/>
          </div>
          <p className="serial-note">Use the QR to check in. The printed DPSB number is a serial number.</p>
          {error && <div className="alert" role="alert"><CircleAlert size={18}/> {error}</div>}
          {result && <div className={"result "+state} role="status">
            {state==="valid" || state==="done" ? <BadgeCheck size={24}/> : state==="used" ? <Clock3 size={24}/> : <CircleAlert size={24}/>}
            <div><strong>{stateTitle[state]}</strong><p>{result.pass ? result.pass.name + " · " + passNumber(result.pass.id) : "Ask to see the original ticket QR."}{result.pass?.admittedAt ? " · "+timestamp(result.pass.admittedAt) : ""}</p></div>
            {state==="valid" && <button className="primary admit" disabled={busy} onClick={() => void check(result.code,true)}><Check size={17}/> Admit guest</button>}
          </div>}
        </section>
        <aside className="side">
          <section className="card overview">
            <div className="card-heading"><span className="small-icon"><Users size={20}/></span><div><h2>Door overview</h2><p>Live attendance</p></div></div>
            <div className="stats">
              <div><strong>{loading || loadError ? "—" : active.length}</strong><span>Issued</span></div>
              <div><strong className="green">{loading || loadError ? "—" : checked.length}</strong><span>Checked in</span></div>
              <div><strong>{loading || loadError ? "—" : active.length-checked.length}</strong><span>Expected</span></div>
            </div>
            <div className="progress-label"><span>Attendance</span><span>{loading || loadError ? "—" : checked.length + " of " + active.length}</span></div>
            <progress aria-label="Attendance" max={active.length || 1} value={checked.length}/>
          </section>
          <section className="card recent">
            <div className="card-heading"><span className="small-icon"><Activity size={20}/></span><div><h2>Recent check-ins</h2></div></div>
            {latest.length ? <ul>{latest.map(pass => <li key={pass.id}><span className="arrival-mark"><Check size={15}/></span><div><strong>{pass.name}</strong><small>{passNumber(pass.id)}</small></div><time dateTime={pass.admittedAt || undefined}>{timestamp(pass.admittedAt || "")}</time></li>)}</ul> :
              <div className="empty-activity"><Clock3 size={20}/><p>{loading ? "Loading activity…" : "Admitted guests will appear here."}</p></div>}
          </section>
        </aside>
      </div> : <section className="card register">
        <div className="register-header">
          <div className="card-heading"><span className="small-icon"><Ticket size={21}/></span><div><h2>Pass register</h2><p>{active.length} of 50 active passes issued · {ticketsPerSheet} tickets per A4 page</p></div></div>
          <div className="register-actions"><button className="secondary" disabled={loading || !!loadError || !active.length || printing} onClick={() => void printPasses()}><Download size={17}/> {printing ? "Preparing PDF…" : "Download print PDF"}</button><button className="secondary" disabled={loading || !!loadError} onClick={() => exportList(active)}><Download size={17}/> Export door list</button><button className="primary" disabled={active.length>=50 || !!loadError} onClick={() => setIssueOpen(value => !value)}><Plus size={18}/> Add guests</button></div>
        </div>
        {issueOpen && <form className="issue-form" onSubmit={issue}>
          <label htmlFor="guest-name">Guest names</label>
          <textarea id="guest-name" autoFocus required maxLength={4100} rows={5} value={name}
            onChange={e => setName(e.target.value)} placeholder={"Enter one name per line"}/>
          <button className="primary" disabled={busy || !name.trim()} type="submit">Issue passes</button>
        </form>}
        {error && <div className="alert" role="alert"><CircleAlert size={18}/> {error}</div>}
        {notice && <div className="alert success" role="status"><Check size={18}/> {notice}</div>}
        {confirmation && <div className="confirm" role="group" aria-label="Confirm cancellation"><p>Cancel <strong>{passNumber(confirmation.id)}</strong> for {confirmation.name}?</p><div><button className="secondary" onClick={() => setConfirmation(null)}>Keep pass</button><button className="danger" disabled={busy} onClick={() => void updatePass(confirmation)}>Cancel pass</button></div></div>}
        <div className="input-wrap list-search"><Search size={17}/><input aria-label="Search passes" placeholder="Search by guest name or pass ID" value={query} onChange={e => setQuery(e.target.value)}/></div>
        {filtered.length ? <ul className="guest-list">{filtered.map(pass => <li key={pass.id}>
          <div className="guest-name"><strong>{pass.name}</strong><small>{passNumber(pass.id)}</small></div>
          <span className={"tag "+(pass.cancelledAt ? "cancelled" : pass.admittedAt ? "checked" : "ready")}>{stateOf(pass)}</span>
          <div className="guest-actions">
            {!pass.cancelledAt && <><button className="secondary" onClick={() => void saveTicket(pass)}><Download size={16}/> Ticket</button><button className="secondary" onClick={() => void copyLink(pass)}><Link2 size={16}/> Copy link</button></>}
            {pass.cancelledAt ? <button className="text-button" disabled={busy || active.length>=50} onClick={() => void updatePass(pass)}>Restore</button> :
              !pass.admittedAt && <button className="text-button" disabled={busy} onClick={() => setConfirmation(pass)}>Cancel</button>}
          </div>
        </li>)}</ul> : <div className="empty-register"><Ticket size={30}/><strong>{loading ? "Loading passes…" : loadError ? "Guest list unavailable" : query ? "No matching passes" : "No passes issued yet"}</strong><p>{!loading && !loadError && !query && "Issue a pass to create a downloadable QR ticket."}</p></div>}
      </section>}
      <footer><span><ShieldCheck size={15}/> The Last Soirée</span><span>Check-in times shown in IST</span></footer>
    </main>
  </>;
}
