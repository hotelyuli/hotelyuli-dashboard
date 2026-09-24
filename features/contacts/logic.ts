export type Contact = { id:string; name:string; category:string; phone:string; notes:string; operator_name:string };
export function normalizePhone(value:string) {
 const phone=value.replace(/[\s()+.-]/g, "");
 if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error("INVALID_PHONE");
 return phone;
}
export function whatsappUrl(phone:string,text:string) { return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`; }
export function operatorContact(contacts:Contact[], operator:string) { const key=operator.trim().toLocaleLowerCase(); return contacts.find(c=>c.operator_name.trim().toLocaleLowerCase()===key); }
/**
 * The Register tour operator list: every Supplier-directory contact of type "tour"
 * (tour operator), by its linked operator name (falling back to the contact name).
 * Contacts is the single source of truth - edit or delete there and the dropdown follows.
 */
export function tourOperatorNames(contacts:Contact[]):string[] {
 const names=new Map<string,string>();
 for(const c of contacts){ if(c.category!=="tour")continue; const name=(c.operator_name.trim()||c.name.trim()); if(name&&!names.has(name.toLocaleLowerCase()))names.set(name.toLocaleLowerCase(),name); }
 return [...names.values()].sort((a,b)=>a.localeCompare(b,"es"));
}
