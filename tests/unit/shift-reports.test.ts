import { afterEach, describe, expect, it, vi } from "vitest";
import { canClose, reportInput } from "@/features/shift-reports/logic";
import { requestShiftSummary } from "@/features/shift-reports/ai";
const input = {date:"2026-09-21",shift:"morning" as const,receptionist:"Grettel",eventIds:[],notes:"",breakfastSent:false,arrivalsContacted:false,takeawayReady:false,eventsReviewed:true,tasksReviewed:true,breakfastReviewed:false,incomeReviewed:false,cashReviewed:false,handover:true};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("shift close",()=>{
 it("requires reviewed tasks and handover",()=>{expect(canClose(input)).toBe(true);expect(canClose({...input,tasksReviewed:false})).toBe(false);expect(canClose({...input,handover:false})).toBe(false);});
 it("requires financial and breakfast checks for afternoon/night",()=>{for(const shift of ["afternoon","night"] as const){expect(canClose({...input,shift})).toBe(false);expect(canClose({...input,shift,breakfastReviewed:true,incomeReviewed:true,cashReviewed:true})).toBe(true);}});
 it("rejects invalid dates and oversized notes",()=>{expect(reportInput.safeParse({...input,date:"2026-02-30"}).success).toBe(false);expect(reportInput.safeParse({...input,notes:"a".repeat(6001)}).success).toBe(false);});
 it("does not invent a fallback without an API key",async()=>{vi.stubEnv("OPENAI_API_KEY","");await expect(requestShiftSummary({})).rejects.toThrow("AI_NOT_CONFIGURED");});
 it("rejects truncated AI output",async()=>{vi.stubEnv("OPENAI_API_KEY","test");vi.stubEnv("OPENAI_MODEL","test-model");vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({status:"incomplete",output:[]})}));await expect(requestShiftSummary({})).rejects.toThrow("AI_INCOMPLETE");});
 it("uses server instructions and returns completed text",async()=>{vi.stubEnv("OPENAI_API_KEY","test");vi.stubEnv("OPENAI_MODEL","test-model");const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Morning Shift Report\nRoom 15 requires repair."}]}]})});vi.stubGlobal("fetch",fetcher);expect(await requestShiftSummary({notes:"Room 15 requires repair"})).toContain("Room 15");const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.store).toBe(false);expect(body.instructions).toContain("ONLY the supplied JSON facts");});
});
