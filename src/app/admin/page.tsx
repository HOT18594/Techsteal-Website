import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { checkAdmin, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { AdminPanel } from "@/components/AdminPanel";
import { SubPage } from "@/components/SubPage";

export const dynamic = "force-dynamic";

// Admin-only page. Server-side guard: non-admins are redirected to /login.
// The role check re-reads the database so demoting an admin takes effect
// immediately instead of waiting for the session cookie to expire. A DB
// outage is neither — bouncing the admin home silently tells them nothing;
// show the shared "database unreachable" message instead.
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const verdict = await checkAdmin();
  if (verdict === "db_error") {
    return (
      <SubPage className="max-w-xl items-center justify-center">
        <div className="w-full text-center card p-10 my-16">
          <i className="fa-solid fa-database text-3xl text-[#ffd166] mb-4 block" />
          <h1 className="font-display text-xl font-bold mb-2">Panel unavailable</h1>
          <p className="text-sm text-[var(--muted)]">{ACCOUNT_DB_ERROR_MESSAGE}</p>
        </div>
      </SubPage>
    );
  }
  if (verdict === "no") redirect("/");

  return <AdminPanel currentUser={user} />;
}
