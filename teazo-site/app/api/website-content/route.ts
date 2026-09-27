import { NextResponse } from "next/server";
import {
  getWebsiteContent,
  updateWebsiteContent,
} from "@/app/lib/website-content";
import { validateWebsiteContentPatch } from "@/app/lib/website-content-validators";
import { revalidatePath } from "next/cache";

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

    const validation = validateWebsiteContentPatch(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Validation failed: " + validation.errors.join("; "),
          errors: validation.errors,
        },
        { status: 400 },
      );
    }

    const updated = await updateWebsiteContent(body);

    // Invalidate cached pages so customer-facing changes appear immediately
    revalidatePath("/");
    revalidatePath("/contact");
    revalidatePath("/delivery");
    revalidatePath("/menu");
    revalidatePath("/gallery");
    revalidatePath("/admin/website-content");

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/website-content failed:", error);
    return NextResponse.json(
      {
        error: "Failed to update website content",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
