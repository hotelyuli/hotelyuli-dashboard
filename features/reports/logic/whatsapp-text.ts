/**
 * Text for wa.me links. WhatsApp Desktop on Windows shows emoji from a wa.me link as the replacement
 * character, so the WhatsApp version keeps only Latin-1 (code points up to 0xFF): Spanish letters,
 * "·", ¿ ¡ stay; other accented letters lose their accent; emoji, U+FFFD, lone surrogates and other
 * symbols are removed. Line breaks are kept. Copy and print versions keep their emoji.
 */
const PUNCTUATION: Record<number, string> = {
  0x2013: "-", 0x2014: "-", 0x2212: "-", // en dash, em dash, minus
  0x2018: "'", 0x2019: "'", 0x201c: "\"", 0x201d: "\"", // curly quotes
  0x2026: "...", 0x2022: "·", 0x00a0: " " // ellipsis, bullet, no-break space
};

export function sanitize(text: string) {
  let out = "";
  // for...of walks code points; a lone surrogate comes through as a single unit and is dropped below.
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (PUNCTUATION[cp] !== undefined) { out += PUNCTUATION[cp]; continue; }
    if (cp <= 0xff) { out += ch; continue; }
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate
    for (const part of ch.normalize("NFD")) if (part.codePointAt(0)! <= 0xff) out += part;
  }
  return out.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n");
}
