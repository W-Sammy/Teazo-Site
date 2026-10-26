import { revalidatePath } from "next/cache";
import { prepare, batch } from "@/app/lib/d1";
import { DEFAULT_WEBSITE_CONTENT } from "@/app/lib/website-content";
import type { CarouselImage } from "@/app/types/website-content";
import { mintKey, putMedia, toPublicUrl, MAX_MEDIA_BYTES, type MediaType } from "@/app/lib/media";

// send an error msg & http status back to route.ts when input/storage checks fail
export class CarouselError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "CarouselError";
        this.status = status;
    }
}

// accept png, jpeg, webp imgs up to 5mb
const MAX_IMAGE_BYTES = Math.min(MAX_MEDIA_BYTES, 5 * 1024 * 1024);

// returns file extension for accepted file formats
function getImageExtension(type: string): string | undefined {
    if (type === "image/png")
        return "png";
    if (type === "image/jpeg")
        return "jpg";
    if (type === "image/webp")
        return "webp";
    return undefined;
}

// check file headers
function matchesImageHeader(bytes: Uint8Array, type: string): boolean {
    // check png header
    if (type === "image/png") {
        const signature = [137, 80, 78, 71, 13, 10, 26, 10]; // 8 bytes every png file starts with
        // reject files that're too short
        if (bytes.length < 24)
            return false;

        // compare each starting byte with png signature; reject if any do not match
        for (let index = 0; index < signature.length; index++)
            if (bytes[index] !== signature[index])
                return false;

        return true;
    }

    // check starting bytes expected for jpeg header
    if (type === "image/jpeg")
        return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;

    // check starting bytes expected for webp header
    if (type === "image/webp") {
        if (bytes.length < 16)
            return false;

        const fileHeader = String.fromCharCode(...bytes.slice(0, 4));
        const imageFormat = String.fromCharCode(...bytes.slice(8, 12));
        return fileHeader === "RIFF" && imageFormat === "WEBP";
    }

    return false;
}

// check whether database url & access token are configured
function isDatabaseConfigured(): boolean {
    return Boolean(process.env.D1_PROXY_URL && process.env.PROXY_TOKEN);
}

// read saved carousel json from database
async function readCarouselRow() {
    return prepare(
        `SELECT value FROM content_block WHERE key = 'home.carousel'`
    ).first<{ value: string | null }>();
}

// read & check the saved list; null means no carousel row exists yet
async function readCarouselImages(errorMessage: string): Promise<CarouselImage[] | null> {
    const row = await readCarouselRow();
    if (!row) return null;
    const images = JSON.parse(row.value ?? "null");
    if (!Array.isArray(images)) throw new CarouselError(errorMessage, 409);
    return images;
}

// update one img while keeping the list order & other settings --expectedSrc used for replacements so a stale upload can't overwrite newer files
function createImageUpdate(id: unknown, patch: object, expectedSrc: string | null = null) {
    return prepare(
        `UPDATE content_block SET value = (
            SELECT json_group_array(json(updated.image)) FROM (
                SELECT CASE WHEN json_extract(entry.value, '$.id') = ?1
                    THEN json_patch(entry.value, ?2) ELSE entry.value END AS image
                FROM json_each(content_block.value) AS entry
                ORDER BY CAST(entry.key AS INTEGER)
            ) AS updated
        ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE key = 'home.carousel' AND (?3 IS NULL OR EXISTS (
            SELECT 1 FROM json_each(content_block.value) AS current
            WHERE json_extract(current.value, '$.id') = ?1
                AND json_extract(current.value, '$.src') = ?3
        ))`
    ).bind(id, JSON.stringify(patch), expectedSrc);
}

// refresh landing/admin pages without treating saved changes as failure if refresh throws an error
function refreshCarouselPages(errorMessage: string) {
    try {
        revalidatePath("/");
        revalidatePath("/admin/website-content");
    } catch (error) {
        console.error(errorMessage, error);
    }
}

// get the file key for uploaded carousel imgs-- original imgs are in public so they don't have R2 keys
function getUploadedImageKey(src: unknown): string | null {
    if (typeof src !== "string")
        return null;

    // only accept storage keys inside carousel/using the expected characters
    if (!/^carousel\/[a-z0-9/_.-]+$/i.test(src))
        return null;

    // reject parent/directory markers & repeated slashes in the storage key
    if (src.includes("..") || src.includes("//"))
        return null;

    return src;
}

// descs & visibility of imgs are changed via metadata request
function hasValidImageSettings(input: Record<string, unknown>): boolean {
    if (Array.isArray(input))
        return false;

    // reject extra fields so request can't change img source or other data
    const allowedFields = ["action", "id", "alt", "enabled"];
    for (const field of Object.keys(input))
        if (!allowedFields.includes(field))
            return false;

    // img id must be text, can't be blank & isn't above 100 chars
    if (typeof input.id !== "string" || !input.id.trim() || input.id.length > 100)
        return false;

    if ("alt" in input && typeof input.alt !== "string")
        return false;

    if ("enabled" in input && typeof input.enabled !== "boolean")
        return false;

    // requires at least one update but empty descs are still allowed
    return "alt" in input || "enabled" in input;
}

// find which R2 storage space contains uploaded img before changing
async function readUploadedImageBucket(key: string): Promise<string> {
    // use the img's file key to look up its storage location in the database
    const tracked = await prepare(
        `SELECT DISTINCT r2_bucket FROM r2_object WHERE r2_key = ?1`
    ).bind(key).all<{ r2_bucket: string }>();

    // stop if no location is found or multiple locations match
    if (tracked.results.length !== 1)
        throw new CarouselError("Couldn't identify one storage bucket for this image. Nothing was removed; check its r2_object record.", 409);

    // return location name so cleanup knows where to find file
    return tracked.results[0].r2_bucket;
}

// build same cleanup queries for replacing & removing imgs
function createCleanupStatements(key: string, bucket: string) {
    // leave the file alone if saved content still uses it
    const noStoredKeyReferences = `
        NOT EXISTS (
            SELECT 1 FROM content_block AS block
            WHERE instr(COALESCE(block.value, ''), ?1) > 0
                    OR EXISTS (
                        SELECT 1 FROM json_tree(CASE WHEN json_valid(block.value) THEN block.value ELSE 'null' END) AS entry
                        WHERE entry.type = 'text' AND instr(entry.atom, ?1) > 0
                    )
        )
        AND NOT EXISTS (SELECT 1 FROM site_link WHERE instr(COALESCE(url, ''), ?1) > 0)`;

    // leaves file's metadata alone if other features use it
    const noMediaReferences = `
        NOT EXISTS (SELECT 1 FROM event WHERE image_media_id = media.id AND deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM gallery_image WHERE media_id = media.id AND deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM carousel_slide WHERE media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM menu_document WHERE media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM content_block WHERE media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM site_link WHERE icon_media_id = media.id)
        AND NOT EXISTS (SELECT 1 FROM admin_user WHERE avatar_media_id = media.id AND deleted_at IS NULL)`;

    // mark unused metadata as deleted, the actual img file stays in R2 until cleanup
    return [
        prepare(
            `UPDATE media_asset AS media
                SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE r2_bucket = ?2 AND r2_key = ?1 AND deleted_at IS NULL
                    AND ${noStoredKeyReferences} AND ${noMediaReferences}`
        ).bind(key, bucket),

        // add unused files to the cleanup queue if not waiting (they're deleted later)
        prepare(
            `INSERT INTO pending_r2_deletion (r2_bucket, r2_key)
                SELECT ?2, ?1
                WHERE ${noStoredKeyReferences}
                    AND NOT EXISTS (
                        SELECT 1 FROM media_asset WHERE r2_bucket = ?2 AND r2_key = ?1 AND deleted_at IS NULL
                    )
                    AND EXISTS (SELECT 1 FROM r2_object WHERE r2_bucket = ?2 AND r2_key = ?1)
                    AND NOT EXISTS (
                        SELECT 1 FROM pending_r2_deletion
                        WHERE r2_bucket = ?2 AND r2_key = ?1 AND deleted_at IS NULL
                    )`
        ).bind(key, bucket),

    ];
}

// upload img & save its carousel item in database
export async function uploadCarouselImage(formData: FormData) {
    // track uploads where database save might need to be checked before retry
    let uploadedKey: string | undefined;

    try {
        const file = formData.get("file");
        const alt = formData.get("alt") ?? "";

        // if an id is sent then replace that img, otherwise add a new img
        const replacementId = formData.get("id");
        if (replacementId !== null && (typeof replacementId !== "string" || !replacementId.trim() || replacementId.length > 100))
            throw new CarouselError("A valid image ID is required for replacement.", 400);
        if (!(file instanceof File))
            throw new CarouselError("No image file provided.", 400);
        if (typeof alt !== "string")
            throw new CarouselError("Image description must be text.", 400);

        // check file format & reject unsupported, empty, oversized imgs
        const ext = getImageExtension(file.type);
        if (!ext)
            throw new CarouselError("Unsupported image format. Upload PNG, JPG, or WebP.", 415);
        if (file.size === 0)
            throw new CarouselError("Choose a nonempty image that is 5 MB or less.", 400);
        if (file.size > MAX_IMAGE_BYTES)
            throw new CarouselError("Choose a nonempty image that is 5 MB or less.", 413);

        // read file bytes & check its header before uploading
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesImageHeader(bytes, file.type))
            throw new CarouselError("That file doesn't match its image format.", 415);
        if (!isDatabaseConfigured())
            throw new CarouselError("The database/storage connection isn't configured.", 503);

        const savedImages = await readCarouselImages(
            "Existing carousel settings need to be checked before adding images."
        ) ?? [];

        const replacedImage = savedImages.find((image) => image && image.id === replacementId);
        if (replacementId !== null && !replacedImage)
            throw new CarouselError("That image is no longer saved. Refresh the carousel editor.", 404);

        // keep original files in public, old uploaded files go into cleanup queue when unused
        const oldKey = getUploadedImageKey(replacedImage?.src);
        let oldBucket: string | null = null;
        if (oldKey)
            oldBucket = await readUploadedImageBucket(oldKey);

        // generate new storage key so existing file isn't overwritten during upload
        const key = mintKey("carousel", ext);
        // confirm public url settings work before sending file to storage
        toPublicUrl(key);

        // upload file bytes to R2
        const stored = await putMedia(key, bytes, file.type as MediaType);
        uploadedKey = stored.key;
        const url = toPublicUrl(stored.key);

        // save id for replacements (new imgs get new ids)
        const image = {
            id: replacementId ?? crypto.randomUUID(),
            src: stored.key,
            alt,
            enabled: replacedImage?.enabled ?? true,
        };

        if (replacedImage && replacementId !== null) {
            // replace saved file key while keeping img's id, position, desc & visibility
            const statements = [createImageUpdate(replacementId, { src: stored.key }, replacedImage.src)];
            if (oldKey && oldBucket)
                statements.push(...createCleanupStatements(oldKey, oldBucket));

            // save replacement & queue old file cleanup together so database failure rolls both back
            await batch(statements);

            // check if replacement was saved
            const currentRow = await readCarouselRow();
            const currentImages = JSON.parse(currentRow?.value ?? "[]") as CarouselImage[];

            if (!currentImages.some((current) => current.id === replacementId && current.src === stored.key))
                throw new CarouselError("The image changed during the upload. Refresh the carousel editor before trying again.", 409);

        } else { // add the new img without overwriting other uploads happening at the same time
            await batch([
                prepare(
                    `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
                        VALUES ('home.carousel', 'home', 'carousel', 'text', json_array(json(?1)))
                        ON CONFLICT (key) DO UPDATE SET
                            value = json_insert(content_block.value, '$[#]', json(?1)),
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
                ).bind(JSON.stringify(image)),
            ]);
        }

        // refresh the landing/admin pages after the img has been saved
        refreshCarouselPages("Carousel saved, but page revalidation failed:");

        return {
            success: true,
            key: stored.key,
            url,
            image: { ...image, src: url, mediaKey: stored.key },
        };

    } catch (error) {
        if (error instanceof CarouselError)
            throw error;

        console.error("Carousel upload/save failed:", error);

        // don't delete uploaded file if can't tell whether database save went through
        let message = "Couldn't upload the image. Check the database/storage connection and try again.";
        if (uploadedKey)
            message = "The image uploaded, but its database save could not be confirmed. Check the saved carousel before retrying.";

        throw new CarouselError(message, 500);
    }
}

// remove the carousel item & queue its uploaded file for cleanup if nothing else uses it
export async function removeCarouselImage(body: unknown) {
    try {
        // requires requested object with a nonblank text id (must be 100 char or less)
        if (!body || typeof body !== "object" || Array.isArray(body) || !("id" in body) || typeof body.id !== "string" || !body.id.trim() || body.id.length > 100)
            throw new CarouselError("A valid image ID is required.", 400);

        // use the validated img id & check the database connection settings
        const id = body.id;
        if (!isDatabaseConfigured())
            throw new CarouselError("The database connection isn't configured.", 503);

        // load the list; unreadable json shouldn't be overwritten
        let images: CarouselImage[] | null;
        try {
            images = await readCarouselImages("Saved carousel settings are invalid; nothing was removed.");
        } catch (error) {
            if (error instanceof SyntaxError)
                throw new CarouselError("Saved carousel settings are invalid; nothing was removed.", 409);
            throw error;
        }

        if (images) {
            // only uploaded carousel files qualify for cleanup --original public files stay on disk
            const removed = images.find((image) => image && typeof image === "object" && image.id === id);
            const key = getUploadedImageKey(removed?.src);

            let bucket: string | null = null;
            if (key)
                bucket = await readUploadedImageBucket(key);


            // saves an empty list when all imgs are removed so loading the page doesn't bring back original imgs
            const statements: ReturnType<typeof prepare>[] = [
                prepare(
                    `UPDATE content_block
                        SET value = (
                            SELECT json_group_array(json(remaining.value))
                            FROM (
                                SELECT entry.value
                                FROM json_each(content_block.value) AS entry
                                WHERE json_extract(entry.value, '$.id') IS NOT ?1
                                ORDER BY CAST(entry.key AS INTEGER)
                            ) AS remaining
                        ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                        WHERE key = 'home.carousel'`
                ).bind(id),
            ];
            if (key && bucket)
                statements.push(...createCleanupStatements(key, bucket));

            // save removal & cleanup queue entries together so database failure rolls both back
            await batch(statements);
        }

        refreshCarouselPages("Carousel entry removed, but page revalidation failed:");
        return { success: true, id };

    } catch (error) {
        if (error instanceof CarouselError)
            throw error;

        console.error("Carousel removal failed:", error);
        throw new CarouselError("Couldn't confirm image removal. Please try again.", 500);
    }
}

// saves img settings, adds original imgs
export async function saveCarouselSettings(body: unknown) {
    // attempt requested settings/initialization action & report failures to route.ts
    try {
        // if request says "update-image", save changes to existing img's desc/visibility
        if (body && typeof body === "object" && "action" in body && body.action === "update-image")
            return await updateCarouselSettings(body);

        if (!body || typeof body !== "object" || !("action" in body) || body.action !== "initialize-defaults")
            throw new CarouselError("Unknown carousel action.", 400);

        if (!isDatabaseConfigured())
            throw new CarouselError("The database connection isn't configured.", 503);

        await readCarouselImages("Saved carousel settings must be checked before adding originals.");

        // adds back missing originals once, prevents removed originals from being added again
        await batch([
            prepare(
                `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
                    SELECT 'home.carousel', 'home', 'carousel', 'text', ?1
                    WHERE NOT EXISTS (
                        SELECT 1 FROM content_block WHERE key = 'home.carousel_defaults_seeded'
                    )
                    ON CONFLICT (key) DO UPDATE SET value = (
                        SELECT json_group_array(json(combined.image)) FROM (
                            SELECT original.value AS image, 0 AS image_group, CAST(original.key AS INTEGER) AS position
                            FROM json_each(?1) AS original
                            WHERE NOT EXISTS (
                                SELECT 1 FROM json_each(content_block.value) AS saved
                                WHERE json_extract(saved.value, '$.id') = json_extract(original.value, '$.id')
                                    OR json_extract(saved.value, '$.src') = json_extract(original.value, '$.src')
                            )
                            UNION ALL
                            SELECT saved.value AS image, 1 AS image_group, CAST(saved.key AS INTEGER) AS position
                            FROM json_each(content_block.value) AS saved
                            ORDER BY image_group, position
                        ) AS combined
                    ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
            ).bind(JSON.stringify(DEFAULT_WEBSITE_CONTENT.carouselImages ?? [])),

            // save a flag showing originals were initialized so removed ones aren't added again
            prepare(
                `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
                    VALUES ('home.carousel_defaults_seeded', 'home', 'carousel_defaults_seeded', 'text', '1')
                    ON CONFLICT (key) DO NOTHING`
            ),
        ]);

        const row = await readCarouselRow();
        // turn uploaded file keys into urls browser can display
        const savedImages = JSON.parse(row?.value ?? "[]") as CarouselImage[];
        const images = savedImages.map((image) => {
            let src = image.src;
            if (!src.startsWith("/carousel_images/"))
                src = toPublicUrl(src);

            return { ...image, src };
        });
        refreshCarouselPages("Carousel originals saved, but page revalidation failed:");

        return { success: true, images };

    } catch (error) {
        if (error instanceof CarouselError)
            throw error;

        console.error("Carousel settings request failed:", error);
        throw new CarouselError("Couldn't save or load carousel settings. Please retry.", 500);
    }
}

// saves an img's desc & visibility
async function updateCarouselSettings(body: object) {
    const input = body as Record<string, unknown>;

    // only allows desc/visibility changes here
    if (!hasValidImageSettings(input))
        throw new CarouselError("Send an image ID, text description, and/or a true/false visibility setting.", 400);

    if (!isDatabaseConfigured())
        throw new CarouselError("The database connection isn't configured.", 503);

    const row = await readCarouselRow();
    let saved: unknown;

    // read json list & stop if it can't be parsed
    try {
        saved = JSON.parse(row?.value ?? "[]");
    } catch {
        throw new CarouselError("Saved carousel settings are invalid; nothing was changed.", 409);
    }

    // confirm the saved data is a list & requested img still exists before updating it
    if (!Array.isArray(saved))
        throw new CarouselError("Saved carousel settings are invalid; nothing was changed.", 409);

    if (!saved.some((image) => image && image.id === input.id))
        throw new CarouselError("That image is no longer saved. Refresh the carousel editor.", 404);


    // include only settings by this request, leave others items' settings as is
    const patch: { alt?: string; enabled?: boolean } = {};
    if (typeof input.alt === "string")
        patch.alt = input.alt;

    if (typeof input.enabled === "boolean")
        patch.enabled = input.enabled;

    // update the img's settings in current saved list so removed imgs aren't added again
    await batch([createImageUpdate(input.id, patch)]);

    refreshCarouselPages("Carousel settings saved, but page revalidation failed:");
    return { success: true, id: input.id };
}
