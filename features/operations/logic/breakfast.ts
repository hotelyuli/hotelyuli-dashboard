/** Only an affirmative breakfast note enables included covers. Babies are excluded. */
export function breakfastFromNotes(notes: string | null, adults: number, children: number) {
  const text = (notes ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const mentioned = /\bbreakfast\b|\bdesayunos?\b|ארוחת בוקר/.test(text);
  const excluded = /(?:no|without|sin|not included|excluded)\s+(?:\w+\s+){0,2}(?:breakfast|desayunos?)|(?:breakfast|desayunos?)\s+(?:(?:is|esta)\s+)?(?:not included|excluded|no incluido)|ללא ארוחת בוקר/.test(text);
  return { breakfast_status: mentioned && !excluded ? "included" as const : "not_included" as const, breakfast_pax: mentioned && !excluded ? adults + children : 0 };
}
