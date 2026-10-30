import { NextResponse } from "next/server";
import { requireAdminApi } from "@/app/lib/admin";
import { CarouselError, uploadCarouselImage, removeCarouselImage, saveCarouselSettings } from "@/app/lib/carousel";

// use the Node.js runtime for handling uploaded files
export const runtime = "nodejs";

// grab error msg & status from carousel.ts in lib folder when request fails
function errorResponse(error: unknown) {
    // expected errors keep the msg & HTTP status provided by the library
    if (error instanceof CarouselError)
        return NextResponse.json({ error: error.message }, { status: error.status });
    
    // log unexpected errors
    console.error("Unexpected carousel request error:", error);
    return NextResponse.json({ error: "Couldn't complete the carousel request. Please retry." }, { status: 500 });
}

// upload & save an img!
export async function POST(request: Request) {
    // check admin access
    const access = await requireAdminApi(request, 2);
    if (!access.ok)
        return access.response;
    
    // save img via formData
    try {
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch { // reject requests that can't be read as formData
            throw new CarouselError("Send the image using FormData.", 400);
        }

        // validate file then uploads/adds/replaces specific item in carousel
        const result = await uploadCarouselImage(formData);
        return NextResponse.json(result, { status: 201 });

    } catch (error) {
        // return error if saving fails
        return errorResponse(error);
    }
}

// remove img & queue its unused uploaded file for cleanup
export async function DELETE(request: Request) {
    // check admin access
    const access = await requireAdminApi(request, 2);
    if (!access.ok)
        return access.response;

    // remove item via json
    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch { // reject requests that cannot be read as JSON
            throw new CarouselError("Send the image ID as JSON.", 400);
        }

        // remove item & queue unused file for cleanup
        const result = await removeCarouselImage(body);
        return NextResponse.json(result);

    } catch (error) {
        // return err if saving fails
        return errorResponse(error);
    }
}

// save img settings or load uploaded imgs without bundled originals
export async function PATCH(request: Request) {
    // check admin access
    const access = await requireAdminApi(request, 2);
    if (!access.ok)
        return access.response;
    
    // save settings/load the saved carousel list
    try {
        const body: unknown = await request.json().catch(() => null);
        // chooses between saving alt text/visibility & loading imgs
        const result = await saveCarouselSettings(body);

        return NextResponse.json(result);
    } catch (error) {
        // return err if saving fails
        return errorResponse(error);
    }
}
