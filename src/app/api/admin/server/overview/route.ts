import { NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import {
  exarotonGetAccount,
  exarotonGetAvailablePlayerLists,
  exarotonGetCreditPools,
  exarotonGetMotd,
  exarotonGetServerInfo,
  getExarotonConfig,
} from "@/lib/exaroton";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  if (!getExarotonConfig()) {
    return NextResponse.json({
      configured: false,
      server: null,
      account: null,
      pools: [],
      motd: null,
      playerLists: [],
    });
  }

  const [serverRes, accountRes, poolsRes, motdRes, listsRes] = await Promise.allSettled([
    exarotonGetServerInfo(),
    exarotonGetAccount(),
    exarotonGetCreditPools(),
    exarotonGetMotd(),
    exarotonGetAvailablePlayerLists(),
  ]);

  return NextResponse.json(
    {
      configured: true,
      server: serverRes.status === "fulfilled" ? serverRes.value : null,
      account: accountRes.status === "fulfilled" ? accountRes.value : null,
      pools: poolsRes.status === "fulfilled" ? poolsRes.value : [],
      motd: motdRes.status === "fulfilled" ? motdRes.value : null,
      playerLists: listsRes.status === "fulfilled" ? listsRes.value : [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
