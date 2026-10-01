/**
 * Size (mm) and position for an image of widthPx x heightPx on one page:
 * as wide as the printable area, shrunk to fit the height if needed, centered horizontally.
 */
export function fitImageToPage(widthPx: number, heightPx: number, page = { width: 210, height: 297, margin: 10 }) {
  const maxWidth = page.width - 2 * page.margin;
  const maxHeight = page.height - 2 * page.margin;
  const scale = Math.min(maxWidth / widthPx, maxHeight / heightPx);
  const width = widthPx * scale;
  const height = heightPx * scale;
  return { x: (page.width - width) / 2, y: page.margin, width, height };
}
