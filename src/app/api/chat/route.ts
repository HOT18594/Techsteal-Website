import { NextRequest, NextResponse } from "next/server";
import { getChatResponse } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ reply: "Please send a message." }, { status: 400 });
    }
    const reply = await getChatResponse(message);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { reply: "I couldn't reach the AI service right now. Try again in a moment." },
      { status: 500 }
    );
  }
}