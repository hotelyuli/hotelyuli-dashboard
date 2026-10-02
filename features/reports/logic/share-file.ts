export const breakfastPdfName = (date: string) => `desayunos-${date}.pdf`;
export const breakfastPngName = (date: string) => `desayunos-${date}.png`;

type ShareNavigator = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };

/**
 * Shares the file itself (WhatsApp, email…) when the device can share files;
 * otherwise, or if sharing fails, downloads it. Cancelling the share sheet does nothing.
 */
export async function shareOrDownload(file: File, nav: ShareNavigator | undefined, download: (file: File) => void): Promise<"shared" | "cancelled" | "downloaded"> {
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }
  download(file);
  return "downloaded";
}
