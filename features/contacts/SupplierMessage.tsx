"use client";
import {useState} from "react";
import Link from "next/link";
import {WhatsAppIcon} from "@/components/WhatsAppIcon";
import {normalizePhone,operatorContact,whatsappUrl,type Contact} from "./logic";
import type {Locale} from "@/lib/i18n";

const OTHER = "__other";

/** Phone typed for "Otro": digits with country code, or null while it is not a valid number. */
export function otherRecipientPhone(value:string):string|null {
 try { return normalizePhone(value); } catch { return null; }
}

export function SupplierMessage({contacts,operator,text,locale}:{contacts:Contact[];operator?:string;text:string;locale:Locale}) {
 const es=locale==="es";
 const [id,setId]=useState("");
 const [otherName,setOtherName]=useState("");
 const [otherPhone,setOtherPhone]=useState("");
 const contact=operator ? operatorContact(contacts,operator) : contacts.find(c=>c.id===id);
 const typedPhone=id===OTHER ? otherRecipientPhone(otherPhone) : null;
 return <div className="supplier-message">
  {!operator&&<select aria-label={es?"Proveedor de mantenimiento":"Maintenance supplier"} value={id} onChange={e=>setId(e.target.value)}>
   <option value="">{es?"Seleccionar proveedor":"Select supplier"}</option>
   {contacts.filter(c=>["maintenance","ac","pool","septic","other"].includes(c.category)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   <option value={OTHER}>{es?"Otro (escribir nombre / número)":"Other (type name / number)"}</option>
  </select>}
  {id===OTHER&&<div className="supplier-other">
   <input aria-label={es?"Nombre (opcional)":"Name (optional)"} placeholder={es?"Nombre (opcional)":"Name (optional)"} value={otherName} onChange={e=>setOtherName(e.target.value)} maxLength={120}/>
   <input aria-label={es?"Número con código de país":"Number with country code"} placeholder="+506 8888 8888" type="tel" value={otherPhone} onChange={e=>setOtherPhone(e.target.value)} maxLength={20}/>
   {otherPhone.trim()&&!typedPhone&&<small role="alert">{es?"Número con código de país, p. ej. +506 8888 8888":"Number with country code, e.g. +506 8888 8888"}</small>}
  </div>}
  {typedPhone
   ? <a className="whatsapp-button" href={whatsappUrl(typedPhone,text)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/>WhatsApp · {otherName.trim()||`+${typedPhone}`}</a>
   : contact
    ? <a className="whatsapp-button" href={whatsappUrl(contact.phone,text)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/>WhatsApp · {contact.name}</a>
    : operator ? <Link className="secondary-button" href="/contacts">{es?`Añadir teléfono: ${operator}`:`Add phone: ${operator}`}</Link> : null}
 </div>;
}
