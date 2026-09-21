export function PaymentMethodOptions() {
  const groups = { "Cards / Tarjetas": ["Visa", "Visa Credit", "Visa Debit", "Mastercard", "Debit Mastercard", "American Express"], "Cash / Efectivo": ["Cash USD", "Cash CRC"], "Bank / Banco": ["Bank transfer", "SINPE", "SINPE Móvil"], OTA: ["Booking VCC", "Expedia Collect", "HostelWorld"], Online: ["PayPal", "Tilopay"], "Agency / Agencia": ["Agency"] };
  return <><option value="">—</option>{Object.entries(groups).map(([group, methods]) => <optgroup key={group} label={group}>{methods.map(method => <option key={method} value={method}>{method}</option>)}</optgroup>)}</>;
}
