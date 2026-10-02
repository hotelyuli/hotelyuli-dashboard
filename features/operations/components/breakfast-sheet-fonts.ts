import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";

// Self-hosted by Next, so the PDF/image capture can embed them (same origin).
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--bk-sans" });
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--bk-display" });

export const breakfastSheetFonts = `${sans.variable} ${display.variable}`;
