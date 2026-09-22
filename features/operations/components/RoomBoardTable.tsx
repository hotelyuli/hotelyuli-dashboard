"use client";
import { PaymentMethodOptions } from "@/components/PaymentMethodOptions";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, MoveRight, Pencil, Repeat } from "lucide-react";
import { dictionary, type Locale } from "@/lib/i18n";
import { getRowHistory, moveGuest, swapRooms, updateOperationCell } from "@/features/operations/actions";
import { HOUSEKEEPERS, bedSetupLabel, supportsBedSetup } from "@/features/operations/logic/room-setup";

export type BoardRow = {
  rowId: string | null;
  roomId: string;
  roomLabel: string;
  guestName: string | null;
  adults: number;
  children: number;
  babies: number;
  totalPax: number;
  departureDate: string | null;
  operationalStatus: "check_in" | "staying" | "available" | "out_of_service";
  breakfastStatus: "included" | "not_included";
  breakfastPax: number;
  breakfastToGo: boolean;
  breakfastNotes: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  outstandingBalance: number | null;
  currency: "USD" | "CRC" | null;
  carPlate: string | null;
  bookingChannel: string | null;
  notes: string | null;
  housekeepingCategory: "priority" | "vacant_after_departure" | "remains_occupied" | null;
  sameDayArrival: boolean;
  unitCode: string;
  housekeeper: string | null;
  bedSetup: "king" | "two_twin" | null;
  /** "HH:MM" (Postgres time trimmed to minutes) or null. */
  breakfastToGoTime: string | null;
};

export type RoomOption = { id: string; displayName: string };

type HistoryEntry = Awaited<ReturnType<typeof getRowHistory>>[number];

export function RoomBoardTable({ rows, rooms, locale }: { rows: BoardRow[]; rooms: RoomOption[]; locale: Locale }) {
  const t = dictionary(locale);
  const [editing, setEditing] = useState<BoardRow | null>(null);
  const [moving, setMoving] = useState<BoardRow | null>(null);
  const [swapping, setSwapping] = useState<BoardRow | null>(null);
  const [viewingHistory, setViewingHistory] = useState<BoardRow | null>(null);

  const statusLabel: Record<BoardRow["operationalStatus"], string> = {
    check_in: t.statusCheckIn,
    staying: t.statusStaying,
    available: t.statusAvailable,
    out_of_service: t.statusOutOfService
  };
  const housekeepingLabel: Record<string, string> = {
    priority: t.priority,
    vacant_after_departure: t.vacantAfterDeparture,
    remains_occupied: t.remainsOccupied
  };
  const paymentStatusLabel: Record<string, string> = {
    pending: t.paymentPending,
    paid: t.paymentPaid
  };

  return (
    <>
      <div className="board-table-wrap">
        <table className="board-table">
          <thead>
            <tr>
              <th>{t.colRoom}</th>
              <th>{t.colGuest}</th>
              <th>{t.colPax}</th>
              <th>{t.colStatus}</th>
              <th>{t.colPayment}</th>
              <th>{t.colBalance}</th>
              <th>{t.colBreakfast}</th>
              <th>{t.colPlate}</th>
              <th>{t.colChannel}</th>
              <th>{t.colDeparture}</th>
              <th>{t.colTours}</th>
              <th>{t.colNotes}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.roomId}>
                <td><strong>{row.roomLabel}</strong>{row.bedSetup && <small className="housekeeping-note">{bedSetupLabel(row.bedSetup, locale)}</small>}</td>
                <td>{row.guestName ?? "—"}</td>
                <td>{row.totalPax || "—"}</td>
                <td>
                  <span className={`status-badge status-${row.operationalStatus}`}>{statusLabel[row.operationalStatus]}</span>
                  {row.housekeepingCategory && <small className="housekeeping-note">{housekeepingLabel[row.housekeepingCategory]}</small>}
                  {row.sameDayArrival && <small className="housekeeping-note">{t.sameDaySwap}</small>}
                  {row.housekeeper && <small className="housekeeping-note">{t.fieldHousekeeper}: {row.housekeeper === "Other" ? t.housekeeperOther : row.housekeeper}</small>}
                </td>
                <td>{row.paymentStatus === "partial" ? t.paymentPartial : row.paymentStatus ? (paymentStatusLabel[row.paymentStatus] ?? row.paymentStatus) : "—"}{row.paymentMethod && <small>{row.paymentMethod}</small>}</td>
                <td>{row.outstandingBalance != null ? `${row.currency ?? ""} ${row.outstandingBalance.toFixed(2)}` : "—"}</td>
                <td>
                  {row.breakfastStatus === "included" ? (
                    <span>{t.breakfastIncluded} · {row.breakfastPax}{row.breakfastToGo ? ` (${t.toGo}${row.breakfastToGoTime ? ` ${row.breakfastToGoTime}` : ""})` : ""}</span>
                  ) : "—"}
                </td>
                <td>{row.carPlate ?? "—"}</td>
                <td>{row.bookingChannel ?? "—"}</td>
                <td>{row.departureDate ?? "—"}</td>
                <td>—</td>
                <td className="notes-cell">{row.notes ?? "—"}</td>
                <td>
                  <div className="row-actions">
                    <button className="icon-button subtle" aria-label={t.editCell} disabled={!row.rowId} onClick={() => setEditing(row)}><Pencil size={15} /></button>
                    <button className="icon-button subtle" aria-label={t.moveGuest} disabled={!row.rowId} onClick={() => setMoving(row)}><MoveRight size={15} /></button>
                    <button className="icon-button subtle" aria-label={t.swapRooms} disabled={!row.rowId} onClick={() => setSwapping(row)}><Repeat size={15} /></button>
                    <button className="icon-button subtle" aria-label={t.viewHistory} disabled={!row.rowId} onClick={() => setViewingHistory(row)}><History size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditCellModal row={editing} t={t} onClose={() => setEditing(null)} />}
      {moving && <MoveGuestModal row={moving} rooms={rooms} t={t} onClose={() => setMoving(null)} />}
      {swapping && <SwapRoomsModal row={swapping} rooms={rooms} rows={rows} t={t} onClose={() => setSwapping(null)} />}
      {viewingHistory && <HistoryModal row={viewingHistory} t={t} locale={locale} onClose={() => setViewingHistory(null)} />}
    </>
  );
}

type Dict = ReturnType<typeof dictionary>;

function EditCellModal({ row, t, onClose }: { row: BoardRow; t: Dict; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [guestName, setGuestName] = useState(row.guestName ?? "");
  const [carPlate, setCarPlate] = useState(row.carPlate ?? "");
  const [bookingChannel, setBookingChannel] = useState(row.bookingChannel ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [paymentMethod, setPaymentMethod] = useState(row.paymentMethod ?? "");
  const [paymentStatus, setPaymentStatus] = useState(row.paymentStatus ?? "");
  const [outstandingBalance, setOutstandingBalance] = useState(row.outstandingBalance != null ? String(row.outstandingBalance) : "");
  const [currency, setCurrency] = useState(row.currency ?? "");
  const [breakfastStatus, setBreakfastStatus] = useState(row.breakfastStatus);
  const [breakfastPax, setBreakfastPax] = useState(String(row.breakfastPax));
  const [breakfastToGo, setBreakfastToGo] = useState(row.breakfastToGo);
  const [breakfastNotes, setBreakfastNotes] = useState(row.breakfastNotes ?? "");
  const [housekeeper, setHousekeeper] = useState(row.housekeeper ?? "");
  const [bedSetup, setBedSetup] = useState(row.bedSetup ?? "");
  const [breakfastToGoTime, setBreakfastToGoTime] = useState(row.breakfastToGoTime ?? "");
  const hasBedSetup = supportsBedSetup(row.unitCode);

  function submit() {
    if (!row.rowId) return;
    const data = new FormData();
    data.set("rowId", row.rowId);
    data.set("guestName", guestName);
    data.set("carPlate", carPlate);
    data.set("bookingChannel", bookingChannel);
    data.set("notes", notes);
    data.set("paymentStatus", paymentStatus);
    data.set("paymentMethod", paymentMethod);
    data.set("outstandingBalance", outstandingBalance);
    data.set("currency", currency);
    data.set("breakfastStatus", breakfastStatus);
    data.set("breakfastPax", breakfastPax);
    data.set("breakfastToGo", String(breakfastToGo));
    data.set("breakfastNotes", breakfastNotes);
    data.set("housekeeper", housekeeper);
    data.set("bedSetup", hasBedSetup ? bedSetup : "");
    data.set("breakfastToGoTime", breakfastToGo ? breakfastToGoTime : "");
    startTransition(async () => {
      try {
        await updateOperationCell(data);
        router.refresh();
        onClose();
      } catch {
        setError("SAVE_FAILED");
      }
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal" role="dialog" aria-modal="true">
        <header><h2>{t.editCellTitle} · {row.roomLabel}</h2><button type="button" onClick={onClose} aria-label={t.cancel}>×</button></header>
        <div className="edit-cell-form">
          {error && <p className="form-error">{error}</p>}
          <label>{t.fieldGuest}<input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} /></label>
          <label>{t.fieldPlate}<input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} maxLength={20} /></label>
          <label>{t.fieldChannel}<input value={bookingChannel} onChange={(e) => setBookingChannel(e.target.value)} maxLength={60} /></label>
          <label>{t.fieldPaymentMethod}<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><PaymentMethodOptions /></select></label>
          <label>{t.fieldPaymentStatus}<select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="">—</option><option value="paid">{t.paymentPaid}</option><option value="pending">{t.paymentPending}</option><option value="partial">{t.paymentPartial}</option></select></label>
          <label>{t.fieldBalance}<input type="number" step="0.01" value={outstandingBalance} onChange={(e) => setOutstandingBalance(e.target.value)} /></label>
          <label>{t.fieldCurrency}
            <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "CRC" | "")}>
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="CRC">CRC</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={breakfastStatus === "included"} onChange={(e) => { const included = e.target.checked; setBreakfastStatus(included ? "included" : "not_included"); if (included && Number(breakfastPax) === 0) setBreakfastPax(String(row.totalPax || 1)); }} />
            {t.fieldBreakfastIncluded}
          </label>
          <label>{t.fieldBreakfastPax}<input type="number" min={0} value={breakfastPax} onChange={(e) => setBreakfastPax(e.target.value)} /></label>
          <label className="checkbox-field">
            <input type="checkbox" checked={breakfastToGo} onChange={(e) => setBreakfastToGo(e.target.checked)} />
            {t.fieldBreakfastToGo}
          </label>
          {breakfastToGo && <label>{t.fieldBreakfastToGoTime}<input type="time" value={breakfastToGoTime} onChange={(e) => setBreakfastToGoTime(e.target.value)} /></label>}
          <label>{t.fieldHousekeeper}
            <select value={housekeeper} onChange={(e) => setHousekeeper(e.target.value)}>
              <option value="">{t.housekeeperUnassigned}</option>
              {HOUSEKEEPERS.map((name) => <option key={name} value={name}>{name === "Other" ? t.housekeeperOther : name}</option>)}
            </select>
          </label>
          {hasBedSetup && <label>{t.fieldBedSetup}
            <select value={bedSetup} onChange={(e) => setBedSetup(e.target.value as typeof bedSetup)}>
              <option value="">{t.bedSetupUnset}</option>
              <option value="king">King</option>
              <option value="two_twin">2 Twin</option>
            </select>
          </label>}
          <label>{t.fieldBreakfastNotes}<input value={breakfastNotes} onChange={(e) => setBreakfastNotes(e.target.value)} maxLength={300} /></label>
          <label className="full-width">{t.fieldNotes}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></label>
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="primary-button" disabled={pending} onClick={submit}>{pending ? "…" : t.save}</button>
        </footer>
      </section>
    </div>
  );
}

function MoveGuestModal({ row, rooms, t, onClose }: { row: BoardRow; rooms: RoomOption[]; t: Dict; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const options = rooms.filter((room) => room.id !== row.roomId);
  const [targetRoomId, setTargetRoomId] = useState(options[0]?.id ?? "");

  function submit() {
    if (!row.rowId || !targetRoomId) return;
    const data = new FormData();
    data.set("rowId", row.rowId);
    data.set("targetRoomId", targetRoomId);
    startTransition(async () => {
      try {
        await moveGuest(data);
        onClose();
      } catch {
        setError("SAVE_FAILED");
      }
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal" role="dialog" aria-modal="true">
        <header><h2>{t.moveGuestTitle}</h2><button type="button" onClick={onClose} aria-label={t.cancel}>×</button></header>
        <div className="edit-cell-form">
          {error && <p className="form-error">{error}</p>}
          <label>{t.targetRoom}
            <select value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)}>
              {options.map((room) => <option key={room.id} value={room.id}>{room.displayName}</option>)}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="primary-button" disabled={pending} onClick={submit}>{pending ? "…" : t.save}</button>
        </footer>
      </section>
    </div>
  );
}

function SwapRoomsModal({ row, rooms, rows, t, onClose }: { row: BoardRow; rooms: RoomOption[]; rows: BoardRow[]; t: Dict; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const options = rooms.filter((room) => room.id !== row.roomId);
  const [targetRoomId, setTargetRoomId] = useState(options[0]?.id ?? "");

  function submit() {
    const targetRow = rows.find((candidate) => candidate.roomId === targetRoomId);
    if (!row.rowId || !targetRow?.rowId) return;
    const data = new FormData();
    data.set("rowIdA", row.rowId);
    data.set("rowIdB", targetRow.rowId);
    startTransition(async () => {
      try {
        await swapRooms(data);
        onClose();
      } catch {
        setError("SAVE_FAILED");
      }
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal" role="dialog" aria-modal="true">
        <header><h2>{t.swapRooms} · {row.roomLabel}</h2><button type="button" onClick={onClose} aria-label={t.cancel}>×</button></header>
        <div className="edit-cell-form">
          {error && <p className="form-error">{error}</p>}
          <label>{t.swapWith}
            <select value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)}>
              {options.map((room) => <option key={room.id} value={room.id}>{room.displayName}</option>)}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="primary-button" disabled={pending} onClick={submit}>{pending ? "…" : t.save}</button>
        </footer>
      </section>
    </div>
  );
}

function HistoryModal({ row, t, locale, onClose }: { row: BoardRow; t: Dict; locale: Locale; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (row.rowId) getRowHistory(row.rowId).then(setEntries);
  }, [row.rowId]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal" role="dialog" aria-modal="true">
        <header><h2>{t.historyTitle} · {row.roomLabel}</h2><button type="button" onClick={onClose} aria-label={t.cancel}>×</button></header>
        <div className="history-list">
          {entries === null && <p>…</p>}
          {entries !== null && entries.length === 0 && <p>{t.historyEmpty}</p>}
          {entries?.map((entry, index) => (
            <div className="history-entry" key={index}>
              <strong>{entry.action}</strong>
              <small>{new Date(entry.created_at).toLocaleString(locale === "es" ? "es-CR" : "en-US")}</small>
            </div>
          ))}
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
        </footer>
      </section>
    </div>
  );
}
