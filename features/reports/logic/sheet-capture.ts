import { fitImageToPage } from "@/features/reports/logic/pdf-fit";

/**
 * PDF and PNG of a printable sheet, made in the browser from a copy of the sheet on the page,
 * so screen, Imprimir, PDF and image match. Nothing is uploaded or saved.
 */
export type SheetFormat = { orientation: "portrait" | "landscape"; widthPx: number };

// Printable A4 width at 96 dpi with 10 mm margins: 190 mm portrait, 277 mm landscape.
export const A4_PORTRAIT: SheetFormat = { orientation: "portrait", widthPx: 718 };
export const A4_LANDSCAPE: SheetFormat = { orientation: "landscape", widthPx: 1047 };

/** Renders a copy of the sheet at the printable width (fonts loaded), then removes it. */
async function withPrintCopy<T>(targetId: string, widthPx: number, render: (node: HTMLElement) => Promise<T>) {
  const card = document.getElementById(targetId);
  if (!card) throw new Error("CARD_NOT_FOUND");
  await document.fonts.ready;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;background:#fff`;
  const copy = card.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  // The on-screen top margin would shift the capture down and cut off the footer.
  copy.style.margin = "0";
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    return await render(copy);
  } finally {
    host.remove();
  }
}

async function sheetCanvas(targetId: string, format: SheetFormat) {
  const { toCanvas } = await import("html-to-image");
  return withPrintCopy(targetId, format.widthPx, async (node) => ({
    canvas: await toCanvas(node, { pixelRatio: 2, backgroundColor: "#ffffff" }),
    width: node.offsetWidth,
    height: node.offsetHeight
  }));
}

export async function sheetPng(targetId: string, format: SheetFormat) {
  const { canvas } = await sheetCanvas(targetId, format);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_FAILED")), "image/png"));
}

export async function sheetPdf(targetId: string, fileName: string, format: SheetFormat) {
  const [{ jsPDF }, image] = await Promise.all([import("jspdf"), sheetCanvas(targetId, format)]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: format.orientation });
  const page = format.orientation === "landscape" ? { width: 297, height: 210, margin: 10 } : undefined;
  const { x, y, width, height } = fitImageToPage(image.width, image.height, page);
  // JPEG keeps the file small enough for WhatsApp/email; a PNG of the sheet is several MB.
  pdf.addImage(image.canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, y, width, height);
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PHONE_QUERY = "(pointer: coarse)";
export const subscribePhone = (onChange: () => void) => {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
/** Phones that can share a PDF file (navigator.canShare with files). */
export function canSharePdf() {
  if (!window.matchMedia(PHONE_QUERY).matches || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File(["%PDF"], "hoja.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}
