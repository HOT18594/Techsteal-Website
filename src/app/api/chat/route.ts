import { NextResponse } from "next/server";
import { getChatResponse } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const reply = await getChatResponse(message);
  return NextResponse.json({ reply });
}
