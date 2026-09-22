"use client";
import {useState} from "react";
import Link from "next/link";
import {WhatsAppIcon} from "@/components/WhatsAppIcon";
import {operatorContact,whatsappUrl,type Contact} from "./logic";
import type {Locale} from "@/lib/i18n";
export function SupplierMessage({contacts,operator,text,locale}:{contacts:Contact[];operator?:string;text:string;locale:Locale}) {
 const es=locale==="es";const [id,setId]=useState(""); const contact=operator ? operatorContact(contacts,operator):contacts.find(c=>c.id===id);
 return <div className="supplier-message">{!operator&&<select aria-label={es?"Proveedor de mantenimiento":"Maintenance supplier"} value={id} onChange={e=>setId(e.target.value)}><option value="">{es?"Seleccionar proveedor":"Select supplier"}</option>{contacts.filter(c=>["maintenance","ac","pool","septic","other"].includes(c.category)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}{contact?<a className="whatsapp-button" href={whatsappUrl(contact.phone,text)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/>WhatsApp · {contact.name}</a>:operator?<Link className="secondary-button" href="/contacts">{es?`Añadir teléfono: ${operator}`:`Add phone: ${operator}`}</Link>:null}</div>;
}
