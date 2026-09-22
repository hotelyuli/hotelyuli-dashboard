import { describe, expect, it } from "vitest";
import { tourCommission } from "@/features/records/logic/tour-commission";
describe("tour commission", () => {
 it.each([[0,0],[100,20],[290,58],[580,116],[99.99,20],[123.45,24.69],[75000,15000]])("calculates 20%% of %s",(price,expected)=>expect(tourCommission(price)).toBe(expected));
 it.each([-1,NaN,Infinity,1_000_000_001])("rejects invalid price %s",price=>expect(()=>tourCommission(price)).toThrow());
});
