import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requireAdminAccount, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { AdminPanel } from "@/components/AdminPanel";
import type { AdminSectionId } from "@/components/AdminOverview";
import { SubPage } from "@/components/SubPage";

const VALID_TABS = new Set<AdminSectionId>([
  "overview",
  "members",
  "server",
  "content",
  "moderation",
  "audit",
]);

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  description: "TECHSTEAL administration, server operations, content, and moderation.",
  robots: { index: false, follow: false },
};

// Admin-only page. Server-side guard: non-admins are redirected to /login or /.
// The role check re-reads the database so BOTH promotions and demotions take
// effect immediately instead of waiting for the 7-day session cookie to expire.
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login?next=/admin");

  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return (
      <SubPage className="max-w-xl items-center justify-center">
        <div className="w-full text-center card p-10 my-16">
          <i className="fa-solid fa-database text-3xl text-[#ffd166] mb-4 block" aria-hidden="true" />
          <h1 className="font-display text-xl font-bold mb-2">Panel unavailable</h1>
          <p className="text-sm text-[var(--muted)]">{ACCOUNT_DB_ERROR_MESSAGE}</p>
        </div>
      </SubPage>
    );
  }
  if (gate.status === "no") redirect("/");

  const freshUser = {
    id: gate.account.id,
    username: gate.account.username,
    role: gate.account.role,
    permissions: gate.account.permissions,
    avatarUrl: gate.account.avatarUrl,
    onboarded: gate.account.onboarded,
    discordVerified: gate.account.discordVerified,
    minecraftUsername: gate.account.minecraftUsername ?? null,
  };

  const params = await searchParams;
  const rawTab = typeof params?.tab === "string" ? params.tab : "";
  const initialTab: AdminSectionId = VALID_TABS.has(rawTab as AdminSectionId)
    ? (rawTab as AdminSectionId)
    : "overview";

  return <AdminPanel currentUser={freshUser} initialTab={initialTab} />;
}
