import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { ImportState } from "@/features/csv-import/actions";

/**
 * After "Confirmar importación" the dialog used to close itself 1.2 s later (clean save ->
 * auto-close + router.refresh), taking the retirement confirmation list with it before anyone could
 * tick it. The list must stay open until the person confirms or closes it.
 */
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const commitCsvImport = vi.fn();
const confirmImportRetirement = vi.fn();
vi.mock("@/features/csv-import/actions", () => ({
  commitCsvImport: (...args: unknown[]) => commitCsvImport(...args),
  confirmImportRetirement: (...args: unknown[]) => confirmImportRetirement(...args)
}));
const { CsvImportPanel } = await import("@/features/csv-import/components/CsvImportPanel");

const CSV = "Reservation Number,Guest Name,Check In,LoS,Room Number\nLH-K,King,24-10-2026,2,Room 14\n";
const candidate = { reservation_id: "11111111-1111-4111-8111-111111111111", date: "2026-10-24", room: "Room 14", guest: "Bloom, Jeramie", reference: "LH-B", kind: "missing_from_import", lh_room: null, has_payment: false, lh_paid: false, may_be_extended: false };
const saved = (retirement?: ImportState["retirement"]): ImportState => ({ status: "success", message: "SAVED", ...(retirement ? { retirement } : {}) });

async function importFile() {
  render(<CsvImportPanel locale="es" variant="bar" />);
  const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[0];
  // jsdom's File has no text(): give it the one browsers have.
  const file = Object.assign(new File([CSV], "check_in.csv", { type: "text/csv" }), { text: async () => CSV });
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await act(async () => { fireEvent.submit(screen.getByRole("dialog").querySelector("form")!); });
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("import dialog with a retirement list", () => {
  it("stays open (no auto-close, no refresh) until the person confirms; then closes", async () => {
    commitCsvImport.mockResolvedValue(saved({ importId: "22222222-2222-4222-8222-222222222222", result: { status: "needs_confirmation", candidates: [candidate as never], skipped_dates: [] } }));
    confirmImportRetirement.mockResolvedValue({ ok: true });
    await importFile();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Bloom, Jeramie/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    // A click on the backdrop must not throw the list away either.
    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar (1 seleccionadas)" })); });
    expect(confirmImportRetirement).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", [candidate.reservation_id]);
    expect(screen.getByText(/Listo: 1 reservas ya no cuentan/)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("stays open until the person closes it without confirming", async () => {
    commitCsvImport.mockResolvedValue(saved({ importId: "22222222-2222-4222-8222-222222222222", result: { status: "needs_confirmation", candidates: [candidate as never], skipped_dates: [] } }));
    await importFile();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin confirmar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmImportRetirement).not.toHaveBeenCalled();
  });

  it("a clean import with nothing to review still closes by itself, as before", async () => {
    commitCsvImport.mockResolvedValue(saved());
    await importFile();
    await act(async () => { vi.advanceTimersByTime(1_500); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});
