import { NextResponse } from "next/server";
import {
  getWebsiteContent,
  updateWebsiteContent,
  deleteWebsiteContentEntry,
  WebsiteContentConflictError,
  WebsiteContentNotFoundError,
} from "@/app/lib/website-content";
import { validateWebsiteContentPatch } from "@/app/lib/website-content-validators";
import { requireAdminApi } from "@/app/lib/admin";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function revalidateContent() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/website-content");
}

function writeError(error: unknown) {
  if (error instanceof WebsiteContentNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof WebsiteContentConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("Website content write failed:", error);
  return NextResponse.json(
    { error: "The write could not be confirmed. Reload this page to check current content before trying again.", requiresReload: true },
    { status: 503 },
  );
}

export async function DELETE(request: Request) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  if (
    !body || (body.collection !== "socialLinks" && body.collection !== "holidays") ||
    typeof body.id !== "string" || !body.id.trim() || body.id.length > 200 ||
    !Number.isSafeInteger(body.revision) || body.revision < 0
  ) {
    return NextResponse.json({ error: "A content entry and its current revision are required." }, { status: 400 });
  }

  try {
    const collectionsRevision = await deleteWebsiteContentEntry(body.collection, body.id, body.revision);
    revalidateContent();
    return NextResponse.json({ collectionsRevision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return writeError(error);
  }
}

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
  // Store hours, contact details and the online ordering switch are admin-only.
  const access = await requireAdminApi(request, 2);
  if (!access.ok) {
    return access.response;
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.socialLinks !== undefined && !Array.isArray(body.socialLinks)) ||
      (body.holidays !== undefined && !Array.isArray(body.holidays))) {
      return NextResponse.json({ error: "A valid content update is required." }, { status: 400 });
    }
    if ((body.socialLinks !== undefined || body.holidays !== undefined) &&
      (!Number.isSafeInteger(body.collectionsRevision) || body.collectionsRevision < 0)) {
      return NextResponse.json({ error: "Reload this page to obtain the current content revision." }, { status: 409 });
    }

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
    revalidateContent();

    return NextResponse.json(updated);
  } catch (error) {
    return writeError(error);
  }
}
