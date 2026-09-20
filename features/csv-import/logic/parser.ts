export type CsvRow = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export function parseCsv(source: string): ParsedCsv {
  const text = source.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("EMPTY_CSV");
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0]);
  const records = parseRecords(text, delimiter);
  const headers = records.shift()?.map((header) => header.trim()) ?? [];
  if (!headers.length || headers.some((header) => !header)) throw new Error("INVALID_HEADERS");
  const rows = records
    .filter((record) => record.some((cell) => cell.trim() !== ""))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, (record[index] ?? "").trim()])));
  return { headers, rows };
}

function detectDelimiter(firstLine: string) {
  const candidates = [",", ";", "\t"] as const;
  return candidates.reduce((best, candidate) => countUnquoted(firstLine, candidate) > countUnquoted(firstLine, best) ? candidate : best, ",");
}

function countUnquoted(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function parseRecords(text: string, delimiter: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { record.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field); records.push(record); record = []; field = "";
    } else field += char;
  }
  record.push(field); records.push(record);
  return records;
}
