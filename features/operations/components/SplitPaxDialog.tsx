"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadReservationSplit, saveReservationSplit, type SplitDialogData } from "@/features/operations/actions";
import { evenSplit, splitDifference, type Pax3 } from "@/features/operations/logic/pax";
import type { Locale } from "@/lib/i18n";

const KINDS = ["adults", "children", "babies"] as const;

/** Readable message for the errors set_reservation_split / loadReservationSplit raise. */
function splitError(message: string, es: boolean) {
  if (message.includes("SPLIT_SUM")) return es ? "La suma por habitación no coincide con la reserva." : "The per-room totals don't match the booking.";
  if (message.includes("SPLIT_ROOMS") || message.includes("NOT_MULTI_ROOM")) return es ? "Las habitaciones de la reserva cambiaron. Cierre y vuelva a abrir." : "The booking's rooms changed. Close and open again.";
  if (message.includes("MIGRATION_0033_MISSING")) return es ? "Falta aplicar la migración 0033 en Supabase." : "Migration 0033 is not applied in Supabase.";
  if (message.includes("NOT_AUTHORIZED")) return es ? "No tiene permiso para repartir pax." : "You are not allowed to split pax.";
  return es ? `No se pudo guardar: ${message}` : `Could not save: ${message}`;
}

/** "Repartir pax" / "Editar reparto" button: opens the dialog for the booking of `reservationId`. */
export function SplitPaxButton({ reservationId, locale, edit = false }: { reservationId: string; locale: Locale; edit?: boolean }) {
  const es = locale === "es";
  const [data, setData] = useState<SplitDialogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function open() {
    setError(null);
    startTransition(async () => {
      const result = await loadReservationSplit(reservationId);
      if (result.ok) setData(result.data);
      else setError(splitError(result.error, es));
    });
  }
  return (
    <>
      <button type="button" className="secondary-button split-pax-button" onClick={open} disabled={pending}>
        {pending ? "…" : edit ? (es ? "Editar reparto" : "Edit split") : (es ? "Repartir pax" : "Split pax")}
      </button>
      {error && <small className="form-error" role="alert">{error}</small>}
      {data && <SplitPaxDialog data={data} locale={locale} onClose={() => setData(null)} />}
    </>
  );
}

/**
 * Per-room pax of a booking over several rooms. "Repartir parejo" deals the guests to the rooms in
 * turn (the first rooms take the remainder); every number stays editable. Saving needs adults,
 * children and babies to add up to the booking's exactly.
 */
export function SplitPaxDialog({ data, locale, onClose }: { data: SplitDialogData; locale: Locale; onClose: () => void }) {
  const es = locale === "es";
  const router = useRouter();
  const [rooms, setRooms] = useState<Pax3[]>(() => data.rooms.every((room) => room.current) && data.state === "split"
    ? data.rooms.map((room) => room.current!)
    : evenSplit(data.booking, data.rooms.length));
  const [breakfast, setBreakfast] = useState(data.breakfast);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const diff = splitDifference(data.booking, rooms);
  const balanced = KINDS.every((kind) => diff[kind] === 0);
  const total = (pax: Pax3) => pax.adults + pax.children + pax.babies;
  const label = { adults: es ? "Adultos" : "Adults", children: es ? "Niños" : "Children", babies: es ? "Bebés" : "Babies" };

  function set(index: number, kind: (typeof KINDS)[number], value: string) {
    const number = Math.max(0, Math.min(99, Math.trunc(Number(value) || 0)));
    setRooms((current) => current.map((room, i) => i === index ? { ...room, [kind]: number } : room));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveReservationSplit({ reference: data.reference, arrivalDate: data.arrivalDate, breakfast, rooms: data.rooms.map((room, index) => ({ roomId: room.roomId, ...rooms[index] })) });
      if (!result.ok) { setError(splitError(result.error, es)); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <section className="team-modal split-pax-modal" role="dialog" aria-modal="true" aria-labelledby="split-pax-title">
        <header><h2 id="split-pax-title">{es ? "Repartir pax" : "Split pax"} · {data.reference}</h2><button type="button" onClick={onClose} aria-label={es ? "Cerrar" : "Close"}>×</button></header>
        <p>
          {data.guest ?? "—"} · {es ? "Reserva" : "Booking"}: {data.booking.adults} {label.adults.toLowerCase()} / {data.booking.children} {label.children.toLowerCase()} / {data.booking.babies} {label.babies.toLowerCase()} = <strong>{total(data.booking)} pax</strong> · {data.rooms.length} {es ? "habitaciones" : "rooms"}
        </p>
        {data.state === "resplit" && <p className="form-note">{es ? "La reserva cambió en Little Hotelier desde el último reparto: repártala de nuevo." : "The booking changed in Little Hotelier since the last split: split it again."}</p>}
        <div className="split-pax-tools">
          <button type="button" className="secondary-button" onClick={() => setRooms(evenSplit(data.booking, data.rooms.length))}>{es ? "Repartir parejo" : "Even split"}</button>
          <label className="checkbox-field"><input type="checkbox" checked={breakfast} onChange={(event) => setBreakfast(event.target.checked)} />{es ? "Desayuno incluido para toda la reserva" : "Breakfast included for the whole booking"}</label>
        </div>
        <div className="board-table-wrap">
          <table className="board-table split-pax-table">
            <thead><tr><th>{es ? "Habitación" : "Room"}</th>{KINDS.map((kind) => <th key={kind}>{label[kind]}</th>)}<th>Pax</th>{breakfast && <th>{es ? "Desayunos" : "Breakfasts"}</th>}</tr></thead>
            <tbody>
              {data.rooms.map((room, index) => (
                <tr key={room.roomId}>
                  <td>{room.label}</td>
                  {KINDS.map((kind) => <td key={kind}><input type="number" min={0} max={99} inputMode="numeric" aria-label={`${room.label} ${label[kind]}`} value={rooms[index][kind]} onChange={(event) => set(index, kind, event.target.value)} /></td>)}
                  <td>{total(rooms[index])}</td>
                  {breakfast && <td>{rooms[index].adults + rooms[index].children}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th>Total</th>{KINDS.map((kind) => <th key={kind} className={diff[kind] ? "split-pax-off" : undefined}>{data.booking[kind] - diff[kind]} / {data.booking[kind]}</th>)}<th data-testid="split-total">{total(data.booking) - total(diff)} / {total(data.booking)}</th>{breakfast && <th>{data.booking.adults + data.booking.children - diff.adults - diff.children}</th>}</tr></tfoot>
          </table>
        </div>
        {!balanced && <p className="form-error" role="status">{es ? "La suma debe ser igual a la reserva (adultos, niños y bebés) para guardar." : "The totals must match the booking (adults, children and babies) to save."}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>{es ? "Cancelar" : "Cancel"}</button>
          <button type="button" className="primary-button" onClick={save} disabled={pending || !balanced}>{pending ? "…" : es ? "Guardar reparto" : "Save split"}</button>
        </footer>
      </section>
    </div>
  );
}
