import { redirect } from "next/navigation";
import { isOrganizer } from "../../organizer";

export const dynamic = "force-dynamic";

export default async function OrganizerLogin({searchParams}: {
  searchParams: Promise<{error?: string}>;
}) {
  if (await isOrganizer()) redirect("/admin");
  const {error} = await searchParams;
  return <main className="verify-shell">
    <section className="card verify-card">
      <h1>Organizer sign-in</h1>
      <p>Enter your organizer access key to manage tickets for The Last Soirée.</p>
      <form className="manual" action="/api/session" method="post">
        <label htmlFor="key">Organizer access key</label>
        <div className="input-row">
          <div className="input-wrap"><input id="key" type="password" name="key" autoComplete="current-password" required maxLength={256}/></div>
          <button className="primary" type="submit">Sign in</button>
        </div>
      </form>
      {error && <p className="alert" role="alert">Could not sign in. Check your organizer access key.</p>}
      <a href="/verify">Back to ticket verification</a>
    </section>
  </main>;
}
