import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/accounts";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

// Admin-only page. Server-side guard: non-admins are redirected to /login.
// The role check re-reads the database so demoting an admin takes effect
// immediately instead of waiting for the session cookie to expire.
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser())) redirect("/");

  return <AdminPanel currentUser={user} />;
}
