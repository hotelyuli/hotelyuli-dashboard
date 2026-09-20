import type { MaterializedCell } from "./board";

export type ExistingDailyOperationsRow = { roomId: string; manuallyModified: boolean };

export type MaterializationPlan = {
  toWrite: MaterializedCell[];
  preservedRoomIds: string[];
};

/** Never overwrites a room whose current board row was hand-edited by staff. */
export function planMaterialization(cells: MaterializedCell[], existing: ExistingDailyOperationsRow[]): MaterializationPlan {
  const manualRoomIds = new Set(existing.filter((row) => row.manuallyModified).map((row) => row.roomId));
  const toWrite: MaterializedCell[] = [];
  const preservedRoomIds: string[] = [];

  for (const cell of cells) {
    if (manualRoomIds.has(cell.roomId)) preservedRoomIds.push(cell.roomId);
    else toWrite.push(cell);
  }

  return { toWrite, preservedRoomIds };
}
