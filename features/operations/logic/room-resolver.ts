export type RoomResolution = {
  unitCodes: string[];
  warnings: string[];
};

const DORM_UNIT_CODES = ["B1", "B2", "B3", "B4", "B5", "B6"];

export function resolveRoomTokens(raw: string): RoomResolution {
  const unitCodes: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const tokens = raw
    .split(/[,/&+]| y | and /i)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const resolved = resolveToken(token);
    if (!resolved) {
      warnings.push(token);
      continue;
    }
    for (const unitCode of resolved) {
      if (!seen.has(unitCode)) {
        seen.add(unitCode);
        unitCodes.push(unitCode);
      }
    }
  }

  return { unitCodes, warnings };
}

function resolveToken(token: string): string[] | null {
  const normalized = normalize(token);

  if (/^(?:dorm|bunk)$/.test(normalized)) return DORM_UNIT_CODES;

  const roomMatch = normalized.match(/^(?:habitacion|hab|room)?\s*0*(\d{1,2})$/);
  if (roomMatch) {
    const number = Number(roomMatch[1]);
    if (number === 20) return DORM_UNIT_CODES;
    if (number >= 1 && number <= 19) return [String(number)];
    return null;
  }

  const bedMatch = normalized.match(/^(?:cama|bed|b)\s*0*([1-6])$/);
  if (bedMatch) return [`B${bedMatch[1]}`];

  return null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}
