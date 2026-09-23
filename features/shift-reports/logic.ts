import { z } from "zod";
export const reportInput = z.object({
  date: z.string().date(), shift: z.enum(["morning", "afternoon", "night"]),
  receptionist: z.string().trim().min(1).max(120),
  eventIds: z.array(z.string().uuid()).max(100),
  notes: z.string().trim().max(6000),
  breakfastSent: z.boolean(), arrivalsContacted: z.boolean(), takeawayReady: z.boolean(),
  eventsReviewed: z.boolean(), tasksReviewed: z.boolean(), breakfastReviewed: z.boolean(), incomeReviewed: z.boolean(), cashReviewed: z.boolean(), handover: z.boolean()
});
export type ReportInput = z.infer<typeof reportInput>;
export function canClose(input: ReportInput) {
  return input.eventsReviewed && input.tasksReviewed && input.handover &&
    (input.shift === "morning" || (input.breakfastReviewed && input.incomeReviewed && input.cashReviewed));
}
