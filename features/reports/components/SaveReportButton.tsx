"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReportSnapshot } from "../actions";
export function SaveReportButton(props:{kind:"breakfast"|"housekeeping";date:string;locale:"en"|"es";text:string}){
 const [pending,start]=useTransition();const [message,setMessage]=useState("");const router=useRouter();const es=props.locale==="es";
 return <div><button className="secondary-button" disabled={pending} onClick={()=>start(async()=>{const result=await saveReportSnapshot(props);setMessage(result.ok?(es?"Reporte guardado":"Report saved"):(es?"No se pudo guardar el reporte":"Could not save report"));if(result.ok)router.refresh();})}>{pending?"…":es?"Guardar reporte":"Save report"}</button><span role="status">{message}</span></div>;
}
