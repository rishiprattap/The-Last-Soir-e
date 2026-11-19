import { redirect } from "next/navigation";
import { isOrganizer } from "../organizer";
import Desk from "./desk";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isOrganizer())) redirect("/admin/login");
  return <Desk />;
}
