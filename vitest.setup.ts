import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// next/font only works inside Next's compiler; in unit tests a font is just a class/variable name.
vi.mock("next/font/google", () => {
  const font = (name: string) => () => ({ className: name, variable: name, style: { fontFamily: name } });
  return { Plus_Jakarta_Sans: font("font-jakarta"), Cormorant_Garamond: font("font-cormorant"), Inter: font("font-inter") };
});
