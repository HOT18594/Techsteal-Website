import { NextResponse } from "next/server";
import { getAllAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Public demo-account list for the login page.
// These are demo seed accounts; real Discord OAuth replaces this later.
export async function GET() {
  return NextResponse.json({ accounts: getAllAccounts() });
}
