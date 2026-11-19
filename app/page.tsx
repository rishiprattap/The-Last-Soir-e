import { redirect } from "next/navigation";
import { isOrganizer } from "./organizer";
export const dynamic = "force-dynamic";

export default async function Home() {
  redirect(await isOrganizer() ? "/admin" : "/verify");
}
