/** Shared upload rules only. This file must not import server-side helpers. */
export const MAX_MENU_PDF_BYTES = 4_000_000;
export const MENU_PDF_SIZE_LABEL = "4 MB";
export const CURRENT_MENU_PDF_URL = "/api/menu/pdf";

/** Basic checks shared by the form and the server; the server also checks bytes. */
export function getMenuFileError(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Please choose a PDF file ending in .pdf.";
  }

  // Some browsers report an empty or generic type for a PDF selected from disk.
  if (file.type && !["application/pdf", "application/octet-stream"].includes(file.type)) {
    return "Please choose a PDF, not an image or another file type.";
  }

  if (file.size === 0) return "The selected PDF is empty.";
  if (file.size > MAX_MENU_PDF_BYTES) {
    return `The PDF must be ${MENU_PDF_SIZE_LABEL} or smaller.`;
  }

  return null;
}

export type MenuUploadResponse = {
  success: true;
  documentId: string;
};

export function isMenuUploadResponse(value: unknown): value is MenuUploadResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === true &&
    "documentId" in value &&
    typeof value.documentId === "string"
  );
}
