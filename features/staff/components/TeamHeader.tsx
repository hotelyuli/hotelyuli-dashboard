"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Moon, Sun, Users, X } from "lucide-react";
import { saveDailyTeam, setActiveShift } from "@/features/staff/actions";
import type { Locale } from "@/lib/i18n";
import { dictionary } from "@/lib/i18n";

type Shift = "morning" | "afternoon";
type Assignment = {
  morning_receptionist: string;
  afternoon_receptionist: string;
  security_guard: string;
};

import { RECEPTIONISTS as receptionists } from "@/features/staff/receptionists";
const guards = ["Yei Hernandez", "Rolando Fonseca", "Andrés", "Oscar"];

export function TeamHeader({ locale, shift, assignment }: { locale: Locale; shift: Shift; assignment: Assignment }) {
  const [open, setOpen] = useState(false);
  const [optimisticShift, setOptimisticShift] = useOptimistic(shift);
  const [, startTransition] = useTransition();
  const t = dictionary(locale);
  const activeReceptionist = optimisticShift === "morning" ? assignment.morning_receptionist : assignment.afternoon_receptionist;

  return <>
    <div className="shift-switch" aria-label={locale === "es" ? "Turno actual" : "Current shift"}>
      {(["morning", "afternoon"] as const).map((item) => (
        <button key={item} onClick={() => startTransition(async () => { setOptimisticShift(item); const data = new FormData(); data.set("shift", item); await setActiveShift(data); })} className={optimisticShift === item ? "active" : ""} aria-pressed={optimisticShift === item}>{item === "morning" ? t.morning : t.afternoon}</button>
      ))}
    </div>
    <button className="team-button" onClick={() => setOpen(true)}><Users size={17} />{t.todaysTeam}</button>
    <div className="staff-chip"><small>{t.receptionist} · {optimisticShift === "morning" ? t.morning : t.afternoon}</small><strong>{activeReceptionist}</strong></div>
    <div className="security-chip"><span className="status-dot" /><small>{t.securityOnDuty}</small><strong>· {assignment.security_guard}</strong></div>

    {open && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="team-modal" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
        <header><h2 id="team-modal-title">{t.teamAssignment}</h2><button type="button" onClick={() => setOpen(false)} aria-label={t.cancel}><X /></button></header>
        <form action={saveDailyTeam}>
          <div className="team-fields">
            <StaffSelect icon={<Sun size={20} />} title={t.morning} label={t.receptionist} name="morningReceptionist" values={receptionists} initial={assignment.morning_receptionist} other={t.other} />
            <StaffSelect icon={<span aria-hidden="true">🏨</span>} title={t.afternoon} label={t.receptionist} name="afternoonReceptionist" values={receptionists} initial={assignment.afternoon_receptionist} other={t.other} />
            <StaffSelect icon={<Moon size={20} />} title={t.nightGuard} label={t.security} name="securityGuard" values={guards} initial={assignment.security_guard} other={t.other} />
          </div>
          <p className="team-note">{t.teamSaveNote}</p>
          <footer><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t.cancel}</button><button className="primary-button" type="submit">{t.saveTeam}</button></footer>
        </form>
      </section>
    </div>}
  </>;
}

function StaffSelect({ icon, title, label, name, values, initial, other }: { icon: React.ReactNode; title: string; label: string; name: string; values: string[]; initial: string; other: string }) {
  const known = values.includes(initial);
  const [selected, setSelected] = useState(known ? initial : "__other");
  const [custom, setCustom] = useState(known ? "" : initial);
  return <fieldset className="staff-select-card">
    <legend><span>{icon}</span>{title}</legend>
    <label>{label}<select value={selected} onChange={(event) => setSelected(event.target.value)}>{values.map(value => <option key={value}>{value}</option>)}<option value="__other">{other}</option></select></label>
    {selected === "__other" && <input aria-label={`${label} ${other}`} value={custom} onChange={(event) => setCustom(event.target.value)} required minLength={2} maxLength={120} />}
    <input type="hidden" name={name} value={selected === "__other" ? custom : selected} />
  </fieldset>;
}
