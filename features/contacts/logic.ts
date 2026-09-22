export type Contact = { id:string; name:string; category:string; phone:string; notes:string; operator_name:string };
export function normalizePhone(value:string) {
 const phone=value.replace(/[\s()+.-]/g, "");
 if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error("INVALID_PHONE");
 return phone;
}
export function whatsappUrl(phone:string,text:string) { return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`; }
export function operatorContact(contacts:Contact[], operator:string) { const key=operator.trim().toLocaleLowerCase(); return contacts.find(c=>c.operator_name.trim().toLocaleLowerCase()===key); }
