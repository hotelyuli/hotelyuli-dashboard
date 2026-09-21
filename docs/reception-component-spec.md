> Current user overrides (2026-09-21): retain English and Spanish UI; breakfast reports include guest names; housekeeping reports exclude guest names; tours are paid through the travel office and do not collect payment method or automatically count as hotel income. `Notes` is the standard import column. This document is a target specification, not a claim that every module is implemented. Google Sheets currently has an outbox only; its delivery integration remains outstanding.

# YuliOS — Full Component Specification (Reception Dashboard)

**Source:** `reception-os.html` prototype. **Target:** the live Next.js 16 + Supabase build.
**Purpose:** rebuild every screen in React to match this prototype 1:1 — same layout, same Spanish copy, same design tokens — but reading/writing **live Supabase data** instead of the prototype's in-memory arrays.
**Operational UI language:** Spanish. **Generated shift report:** English. **Currencies:** USD and CRC always shown separately, never summed, never converted.

---

## 0. How to use this document

For each component below you get: **Purpose** (what it does), **Content / fields** (exact Spanish labels), **Design** (exact CSS values), **Data source** (which Supabase table feeds it), and **Interactions**. Build component by component. Everything visual is fixed by this spec; only the data wiring is yours to implement.

---

## 1. Design system (global — define once)

### 1.1 Color tokens (CSS variables on `:root`)

```css
--wine:#4D333E;          /* primary brand: headings, nav, topbar bg */
--wine-soft:#6b4c58;     /* secondary wine text (chips) */
--terracotta:#C97B77;    /* primary action / active state / accents */
--terracotta-deep:#b0645f;/* hover on terracotta */
--cream:#FAF8F5;         /* app background */
--blush:#F0EAE4;         /* card/section backgrounds, table stripes, count pills */
--white:#FFFFFF;         /* surfaces */
--line:#e4dad3;          /* default borders */
--line-strong:#d8cabf;   /* stronger borders, inputs */
--ink:#2f2029;           /* primary text */
--ink-2:#5c4b54;         /* secondary text — raised contrast (readability) */
--ink-3:#786470;         /* helper/placeholder — raised contrast (readability) */
--sage:#5f7a63;          /* "available" / paid / positive */
--sage-bg:#eaf0ea;
--amber:#9a6d2f;         /* partial / to-go / warning */
--amber-bg:#f5ecdd;
--wine-bg:#efe4e8;       /* arrival badge / tour chip bg */
--danger:#8f3b3b;        /* pending / complaint / high priority */
--danger-bg:#f4e2e2;
--shadow:0 1px 2px rgba(77,51,62,.06),0 6px 20px rgba(77,51,62,.06);

```

**Rules:** no gradients. No bright dashboard colors. Status is never communicated by color alone — always dot + text label.

### 1.2 Typography

- Load Google Fonts: `Cormorant Garamond` (weights 500,600,700) + `Plus Jakarta Sans` (400,500,600,700).
- **Body / operational content:** Plus Jakarta Sans, base `15px`, line-height 1.5, color `--ink`.
- **Headings (****`h1,h2,h3`****) and** **`.serif`** **and KPI numbers:** Cormorant Garamond.
- Placeholders use `--ink-3` at full opacity (not the browser's faint grey) — readability requirement.

### 1.3 Type scale (exact)

| Element Font Size Weight  |           |        |                                     |
| ------------------------- | --------- | ------ | ----------------------------------- |
| Brand name                | Cormorant | 27px   | 600                                 |
| Panel title `h2.serif`    | Cormorant | 22px   | 600                                 |
| Sidebar panel title       | Cormorant | 18px   | 600                                 |
| Modal title `h3`          | Cormorant | 24px   | —                                   |
| KPI value                 | Cormorant | 38px   | 600, tabular-nums                   |
| Clock time                | —         | 20px   | 600, tabular-nums                   |
| Table header `th`         | Jakarta   | 11px   | 700, uppercase, letter-spacing .8px |
| Table cell                | Jakarta   | 13.5px | —                                   |
| Button                    | Jakarta   | 13.5px | 600                                 |
| Count pill                | Jakarta   | 12px   | 600                                 |

### 1.4 Shared primitives

- **Button** **`.btn`****:** border `1px solid --line-strong`, bg white, color `--wine`, padding `9px 16px`, radius `9px`, font 13.5px/600. Hover → border+text terracotta. 
  - `.btn.primary` = terracotta bg, white text (hover `--terracotta-deep`).
  - `.btn.wine` = wine bg, white text (used for "Cerrar turno").
  - `.btn.sm` = padding `6px 11px`, 12.5px, radius 7px.
- **Panel:** white bg, `1px solid --line`, radius `12px`, `--shadow`. Header row: flex, padding `15px 18px`, bottom border `--line`; title `h2.serif` wine; optional count pill (blush bg, `--ink-3`, radius 20px); right-aligned action group `.r`.
- **Toast:** wine bg, white, bottom-center, radius 10px, fades in \~2.4s. Use for every save/confirm ("Cambios guardados", "…registrado en auditoría", etc.).

---

## 2. Global layout

Order top→bottom: **Header (sticky)** → **Nav (sticky)** → **Action toolbar** → **two-column body**.

- Body grid: main column `1fr` + right sidebar `340px`, gap `22px`, padding `22px 26px 40px`, max-width `1680px` centered.
- Below `1180px`: sidebar drops under the main column (single column).

---

## 3. Header (topbar)

**Purpose:** identity + live time + who is on shift.
**Design:** wine bg (`--wine`), text `#f4ecef`, flex row, gap 28px, padding `14px 26px`, sticky top, z-40.
**Content (left → right):**

1. **Brand:** circular terracotta badge with `🦜` (30px) + `Hotel Yuli` (Cormorant 27px) + sub-line `RECEPCIÓN OS · UVITA` (11px, letter-spacing 2.5px, uppercase, `#d9c3cb`). *In the real build replace the emoji with the Hotel Yuli logo mark.*
2. **Live clock:** date line (`es-CR`, weekday + day + month + year, capitalized, 12.5px `#e7d6dd`) above time (`HH:MM:SS`, 24h `es-CR`, 20px 600 tabular). Ticks every second.
3. **Shift toggle** (right group): two segments `Mañana` / `Tarde`; active segment terracotta bg. Selecting a shift updates the receptionist chip and the generated report.
4. **Receptionist chip:** small label `RECEPCIÓN` + value (current shift's receptionist).
5. **Security pill:** green dot + `Seguridad en turno · <name>`. Non-report shift — informational only.

**Data source:** `daily_staff_assignments` for today (`morning_receptionist`, `afternoon_receptionist`, `security_guard`). Shift selection persists (cookie `yulios-shift`, already implemented).

---

## 4. Navigation

**Purpose:** switch between operational modules.
**Design:** white bg, bottom border `--line`, sticky under header (top 63px), padding `0 26px`. Tabs: 15px/600 `--ink-2`; active tab wine text + 2.5px terracotta bottom-border. Horizontal scroll on overflow.
**Tabs (exact order & labels):** `Operaciones` · `Limpieza` · `Desayuno` · `Eventos` · `Tareas` · `Tours` · `Ingresos` · `Reportes`.
(The live build also has a `Dashboard` tab; keep these eight as the operational set.)

---

## 5. Action toolbar

**Purpose:** the shift's primary actions, always reachable.
**Design:** cream bg, bottom border `--line`, padding `16px 26px`, flex-wrap, gap 10px. A flexible spacer pushes "Cerrar turno" to the right.
**Buttons (exact labels + style + action):**

| Label Style Action       |                      |                                                |
| ------------------------ | -------------------- | ---------------------------------------------- |
| `＋ Registrar evento`     | primary (terracotta) | opens Event modal                              |
| `💾 Guardar`             | default              | save current edits → toast "Cambios guardados" |
| `🥐 Reporte de desayuno` | default              | go to Desayuno view                            |
| `🧹 Lista de limpieza`   | default              | go to Limpieza view                            |
| `🌊 Registrar tour`      | default              | opens Tour modal                               |
| `💵 Registrar ingreso`   | default              | opens Income modal                             |
| `🔒 Cerrar turno`        | wine, right-aligned  | go to Reportes view                            |

*Replace emoji with Lucide icons in the real build (already the pattern): Plus, Save, Coffee, Sparkles/Brush, Waves, Banknote, Lock.*

---

## 6. Operaciones view (the core screen)

### 6.1 KPI grid

**Purpose:** the day at a glance.
**Design:** 4-column grid (2 cols ≤900px), gap 14px. Card: white, `1px --line`, radius 12px, `--shadow`, padding `15px 16px`. Label 12.5px/600 `--ink-2`; value Cormorant 38px wine tabular; foot 11.5px `--ink-3`. Cards flagged `accent` get a 3px left terracotta border.
**The 8 cards (label / foot / accent?):**

1. `Check-ins` / "llegadas de hoy" / **accent**
2. `Check-outs` / "salidas de hoy"
3. `Permanecen` / "stay-through"
4. `Disponibles` / "unidades libres"
5. `Desayunos` / "pax incluidos"
6. `Pagos pendientes` / "reservas con saldo" / **accent**
7. `Tareas abiertas` / "sin resolver" / **accent**
8. `Tours vendidos` / "hoy"

**Data source (all for today, hotel-scoped):**

- Check-ins = count `daily_operations.operational_status = 'check_in'`
- Check-outs = count of departures today (from `departure_records` / status logic)
- Permanecen = count `operational_status = 'staying'`
- Disponibles = count `operational_status = 'available'`
- Desayunos = **sum** **`breakfast_pax`** **where** **`breakfast_status='included'`** **only**
- Pagos pendientes = count `daily_operations` with `outstanding_balance > 0`
- Tareas abiertas = count `tasks` not in (completed, cancelled)
- Tours vendidos = count `tour_bookings` with `tour_date = today` **Never combine USD and CRC in any KPI.**

### 6.2 Secondary occupancy KPI

**Design:** blush bar, radius 10px, padding `12px 16px`, flex. Text "Ocupación de hoy: **X/Y unidades · Z%**" + a progress bar (`--terracotta` fill on `#e0d3ca` track, max-width 260px) + muted note "KPI secundario".
**Data:** occupied (`staying` + `check_in`) ÷ (25 − out_of_service).

### 6.3 Cuadro de habitaciones (Room Board) — the main table

**Purpose:** one row per unit, the live operational board.
**Panel header:** title `Cuadro de habitaciones`, count pill "25 unidades", right action `↔ Mover habitación`.
**Design:** horizontal-scroll wrapper. `th`: 11px uppercase 700 `--ink-2`, bottom border 1.5px `--line-strong`, sticky. `td`: padding `10px 12px`, bottom border `--line`, nowrap. Row hover bg `#fbf7f4`.
**Columns (exact, in order):** `Habitación` · `Huésped` · `Pax` · `Estado` · `Pago` · `Saldo` · `Desayuno` · `Placa` · `Canal` · `Salida` · `Tours` · `Notas` · `Acciones`.
**Cell rendering:**

- **Habitación:** bold wine number + small sub-label ("Habitación" / "Litera 20" for bunks; bunk shows "Cama N").
- **Huésped:** name in `--ink` 600, or muted "Disponible".
- **Estado:** status badge = colored dot + label. Four states: 
  - `Llegada` → `st-llegada` (bg `--wine-bg`, text `--terracotta-deep`, dot terracotta)
  - `Permanece` → `st-permanece` (bg blush, text wine, dot wine)
  - `Disponible` → `st-disponible` (bg `--sage-bg`, text sage, dot sage)
  - `Fuera de servicio` → `st-fuera` (grey)
- **Pago:** text class `pay-pagado` (sage) / `pay-pendiente` (danger) / `pay-parcial` (amber). Values: `Pagado` / `Pendiente` / `Parcial`.
- **Saldo:** tabular, e.g. `USD 180.00` or `CRC 92.000` (currency-prefixed, never mixed).
- **Desayuno:** if included → blush chip "`N pax`" (+ amber chip "Para llevar" if to-go); else muted "No incluido".
- **Placa:** blush chip with plate, or muted "—".
- **Canal:** booking channel text or "—".
- **Salida:** checkout date or "—".
- **Tours:** wine-bg chip with tour name, or "—".
- **Notas:** free text or "—".
- **Acciones:** a `⋮` button opening a row menu (see 6.4). **Sort:** by unit order 1–19 then B1–B6. **Data source:** `daily_operations` for today (joined to `rooms`).

### 6.4 Row action menu (`⋮`)

Dropdown (white, `--line-strong` border, radius 10px, shadow). Items, each writes an `audit_log` entry and toasts:
`Editar huésped` · `Editar habitación` · `↔ Mover huésped` · `⇄ Intercambiar` · (sep) · `Añadir placa` · `Ajustar desayuno` · `Marcar pago` · `Añadir nota` · (sep) · `Ver historial`.
Re-materialization must **not** overwrite a row edited manually (`manually_modified=true`).

### 6.5 Pagos pendientes panel

**Purpose:** collectibles, currencies separate.
**Design:** panel with two total cards (blush, radius 10px): "Total pendiente USD" (`$…`) and "Total pendiente CRC" (`₡…`), Cormorant 30px values. Below: note "Los montos en USD y CRC se muestran por separado y nunca se combinan." Then a table: `Habitación` · `Huésped` · `Salida` · `Monto` · `Estado de pago` · `Acción`, last column a small primary button `Registrar pago`.
**Data:** `daily_operations` where `outstanding_balance > 0`, grouped by currency for the two totals.

---

## 7. Limpieza view (Housekeeping)

**Purpose:** the exact WhatsApp cleaning message.
**Panel actions:** `📋 Copiar` · `🟢 WhatsApp` · `🖨 Imprimir`.
**Design:** monospace-feel report block (`.report-out`: cream bg, `--line-strong` border, radius 12px, padding 22px, pre-wrap, line-height 1.7).
**Exact generated format (Spanish, numbers only):**

```
🧹 HOTEL YULI
Limpieza
{fecha larga en español}

🔴 PRIORIDAD
(Salida + Entrada)
Habitación N …
────────────────────

🟡 QUEDAN VACÍAS
Habitación N …
Cama N …
────────────────────

🟢 PERMANECEN OCUPADAS
Habitación N …

```

**Rules:** room numbers only — no guest names, no room type, no pax. Numeric sort. Bunk shown as "Cama N". PRIORIDAD = departure + same-day arrival; QUEDAN VACÍAS = departure without new arrival; PERMANECEN OCUPADAS = stay-through. All departures included.
**Data source:** derived from `daily_operations.housekeeping_category` for today.
**Copy/WhatsApp:** `Copiar` → clipboard; `WhatsApp` → open `https://wa.me/?text=<encoded>`.

---

## 8. Desayuno view (Breakfast)

**Purpose:** tomorrow/selected-day breakfast list + printable report.
**Panel:** count pill "N pax", actions `📋 Copiar` · `🟢 WhatsApp` · `🖨 Imprimir`.
**Table columns:** `Habitación` · `Huésped` · `Pax desayuno` · `Incluido` · `Para llevar` · `Notas`.
**Generated text block:**

```
🥐 HOTEL YULI
Desayuno
{fecha}

Habitación N — N pax [· PARA LLEVAR]
…
Total cubiertos: N pax

```

**KPI rule:** total = sum `breakfast_pax` where `breakfast_status='included'` only.
**Data source:** `daily_operations` (included rows).

---

## 9. Eventos view

**Purpose:** full shift event log.
**Panel:** count pill, action `＋ Registrar evento` (primary).
**Table columns:** `Hora` · `Categoría` · `Hab./Área` · `Descripción` · `Acción tomada` · `Estado`.
**Estado** rendered as badge. Categories & statuses per the Event modal (§13.1).
**Data source:** `shift_events` for today's shift.

---

## 10. Tareas view

**Purpose:** all open tasks.
**Table columns:** `Prioridad` · `Hab./Área` · `Tarea` · `Departamento` · `Asignado a` · `Estado`.
**Prioridad:** badge (alta/urgente → danger-ish, media → amber, baja → sage). **Estado:** mini pill.
**Rules:** tasks leave the list only when completed/cancelled; every change writes `task_history`; never hard-delete.
**Data source:** `tasks` (open) + `task_history`.

---

## 11. Tours view

**Purpose:** tours ledger.
**Panel action:** `＋ Registrar tour` (primary).
**Table columns:** `Huésped` · `Tour` · `Fecha` · `Pax` · `Proveedor` · `Total` · `Comisión` · `Estado pago`.
**Estado pago** uses the pay-\* color classes.
**Rules:** a `paid` tour creates exactly one `income_transactions` row (idempotent); pending tour payments surface in Pagos pendientes; cancelled/refunded/voided stay in history; commission calculated.
**Data source:** `tour_bookings` (+ `income_transactions` link).

---

## 12. Ingresos view

**Purpose:** daily income log, currencies separate.
**Panel action:** `＋ Registrar ingreso` (primary).
**Two total cards:** "Total ingresos USD" (`$…`) and "Total ingresos CRC" (`₡…`). Note: "Totales de USD y CRC separados. No se realiza conversión automática de moneda."
**Table columns:** `Hora` · `Categoría` · `Huésped` · `Monto` · `Método` · `Tipo`.
**Rules:** never delete; refund/void reference original; reason mandatory for refund/void/adjustment; totals by category and method; USD/CRC never merged.
**Data source:** `income_transactions` for today.
*(This is where the optional Google Sheets export applies — one-way mirror, per the earlier decision.)*

---

## 13. Reportes view (Shift close + English report)

**Purpose:** review the shift and generate the English report.
**Content:** line "Turno de **{Mañana/Tarde}** · **{staff}** · reporte generado en inglés a partir de los eventos registrados." Then the generated English report block. Actions: `Guardar reporte final` (primary) · `📋 Copiar` · `🔒 Confirmar cierre` (wine).
**English report structure (generated from saved events only, invents nothing):**
Title `Morning Shift Report – {date}` / `Afternoon Shift Report – {date}`; sections Arrivals & Departures, Guest Service, Maintenance, Tours/Payments/Administration, Open Follow-ups; ends `Pura Vida, {staff}`.
**Data source:** `shift_events` → server prompt builder → mock generator (M1) → editable → save to `shift_reports.final_report_en`. Editing never mutates source events.
**Shift-close requirements:** morning = review events + acknowledge tasks + generate report; afternoon additionally = review breakfast + review income summary + cash reconciliation + generate report. Handover checkbox: "Confirmo la entrega de estos pendientes al siguiente turno."

---

## 14. Right sidebar

### 14.1 Eventos del turno (panel)

Last \~4 events, newest first. Each row: time (wine-soft, tabular, 42px col) + location·category (`--ink-3`) + summary + a mini status pill (done=sage / follow=amber / pend=danger). Footer: `＋ Registrar evento` (primary, flex) + `Ver todos` (→ Eventos view).
**Data:** `shift_events` today.

### 14.2 Tareas abiertas (panel)

Each row: a 4px priority spine (alta/urgente danger, media amber, baja sage) + location·department + task + "Asignado: {name}" + status mini pill. Footer: `Ver todas` (→ Tareas view).
**Data:** open `tasks`.

### 14.3 Nota general para el siguiente turno

Label + textarea (cream bg, `--line-strong` border, radius 9px, min-height 70px), placeholder "Ej. Revisar A/C hab. 6 tras salida del huésped…". Free-text handover note.

---

## 15. Modals (dialogs)

**Design:** overlay `rgba(47,32,41,.42)`; modal white, radius 16px, max-width 560px, max-height 90vh scroll. Header: `h3.serif` wine + `✕` close. Body: 2-col field grid (`.fgrid`, gap 14px; `.field.full` spans both). Field label 12.5px/600 `--ink-2`; inputs `--line-strong` border, radius 9px, padding `9px 11px`, focus border terracotta. Footer: right-aligned `Cancelar` (default) + primary submit.

### 15.1 Registrar evento (Event modal)

Fields: **Categoría** (select) · **Hora** (time, defaults to now) · **Habitación / Área** (text, placeholder "Ej. Habitación 6 / Recepción") · **Estado** (select) · **Descripción** (textarea, "Describa el evento en español…") · **Acción tomada** (textarea, optional) · **Prioridad** (select: Baja/Media/Alta/Urgente) · **Requiere seguimiento** (No / "Sí → crea tarea abierta"). Helper: "Los estados no completados generan automáticamente una tarea abierta." Submit `Registrar evento`.
**Categoría options:** Llegada · Salida · Solicitud de huésped · Queja de huésped · Cambio de reserva · Mantenimiento · Restaurante · Desayuno · Tour · Pago · Operación interna · Personal · Otro.
**Estado options:** Completado · Pendiente · Seguimiento · Solución temporal · Esperando salida del huésped · Esperando mantenimiento · Esperando proveedor.
**On save:** insert `shift_events`; if status ≠ Completado OR requires follow-up → auto-create one open `tasks` row. Toast accordingly. *(Real build: make this a category-based dynamic form — different fields per category.)*

### 15.2 Registrar tour (Tour modal)

Fields: **Huésped** · **Habitación** · **Tour** (select: Whale Watching / Isla del Caño Snorkeling / Corcovado / Cataratas Nauyaca / Alturas Wildlife Sanctuary / Manglar de Sierpe / Transfer / Sound Healing / Otro) · **Fecha del tour** (date) · **Adultos** (number) · **Niños** (number) · **Precio total** (number) · **Moneda** (USD/CRC) · **Comisión del hotel** (number) · **Estado de pago** (Pendiente/Parcial/Pagado). Submit `Registrar tour`.
**On save:** insert `tour_bookings`; if paid → create one `income_transactions`.

### 15.3 Registrar ingreso (Income modal)

Fields: **Categoría** (Hospedaje/Tour/Transfer/Lavandería/Restaurante/Otro) · **Habitación** · **Monto** (number) · **Moneda** (USD/CRC) · **Método de pago** (Efectivo USD/Efectivo CRC/Tarjeta/SINPE/Transferencia/PayPal/Tarjeta virtual Booking/Otro) · **Tipo** (Pago/Pago parcial/Reembolso/Anulación/Ajuste) · **Descripción**. Submit `Registrar ingreso`.
**On save:** insert `income_transactions`; if Tipo ∈ {Reembolso, Anulación, Ajuste} → reason mandatory + reference original.

---

## 16. Prototype → live build: what changes

The prototype fakes data with in-memory arrays and `localStorage`. In the real build **every component above reads/writes live Supabase** (tables: `rooms`, `reservations`, `daily_operations`, `shift_events`, `tasks`, `task_history`, `tour_bookings`, `income_transactions`, `daily_cash_closings`, `shift_reports`, `audit_log`). Keep the exact layout, copy, and tokens from this spec; replace the mock data layer with Supabase queries + server actions, all hotel-scoped by RLS. No `localStorage` as a store.

---

## 17. Build order (matches modules)

1. Header + Nav + Toolbar shell (tokens, fonts) — mostly done.
2. Operaciones: KPI grid + Room Board + Pagos pendientes (Module 2).
3. Limpieza + Desayuno (Module 3).
4. Eventos + Tareas + Event modal + auto-task (Module 4).
5. Tours + Ingresos + their modals + cash reconciliation (Module 5).
6. Reportes: shift close + English report (Module 6).
7. Sidebar panels wire into events/tasks as those modules land.