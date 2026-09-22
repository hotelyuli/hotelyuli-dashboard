import {cookies} from "next/headers";
import type {Locale} from "@/lib/i18n";
import {getContacts} from "@/features/contacts/actions";
import {ContactDirectory} from "@/features/contacts/ContactDirectory";
export default async function ContactsPage(){
 const locale=((await cookies()).get("yulios-locale")?.value??"es") as Locale;const es=locale==="es";
 const contacts=await getContacts();
 return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">HOTEL YULI · {es?"PROVEEDORES":"SUPPLIERS"}</p><h1>{es?"Directorio de proveedores":"Supplier directory"}</h1><p>{es?"Contactos y mensajes rápidos para coordinar servicios.":"Contacts and quick messages to coordinate services."}</p></div><span className="count-pill">{contacts.length} {es?"contactos":"contacts"}</span></div><ContactDirectory contacts={contacts} locale={locale}/></main>;
}
