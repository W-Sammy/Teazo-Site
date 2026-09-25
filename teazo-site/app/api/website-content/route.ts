import { NextResponse } from "next/server";
import {
  getWebsiteContent,
  updateWebsiteContent,
} from "@/app/lib/website-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const content = await getWebsiteContent();
    return NextResponse.json(content);
  } catch {
    return NextResponse.json(
      { error: "Failed to load website content" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const updated = await updateWebsiteContent(body);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Failed to update website content" },
      { status: 400 },
    );
  }
}
