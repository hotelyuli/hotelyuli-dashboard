import { REPORT_INSTRUCTIONS } from "./logic";
export async function requestShiftSummary(source: unknown): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!key || !model) throw new Error("AI_NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: REPORT_INSTRUCTIONS, input: JSON.stringify(source), store: false, max_output_tokens: 2500 }),
    signal: AbortSignal.timeout(45000), cache: "no-store"
  });
  if (!response.ok) throw new Error("AI_UNAVAILABLE");
  const result = await response.json();
  if (result.status !== "completed") throw new Error("AI_INCOMPLETE");
  const text = (result.output ?? []).filter((item: { type: string }) => item.type === "message")
    .flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
    .filter((part: { type: string }) => part.type === "output_text")
    .map((part: { text: string }) => part.text).join("\n").trim();
  if (!text || text.length > 16000) throw new Error("AI_INCOMPLETE");
  return text;
}
