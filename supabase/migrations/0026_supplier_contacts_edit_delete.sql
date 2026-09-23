begin;
drop policy if exists supplier_contacts_update on public.supplier_contacts;
create policy supplier_contacts_update on public.supplier_contacts for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
drop policy if exists supplier_contacts_delete on public.supplier_contacts;
create policy supplier_contacts_delete on public.supplier_contacts for delete to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
drop trigger if exists supplier_contacts_audit on public.supplier_contacts;
create trigger supplier_contacts_audit after insert or update or delete on public.supplier_contacts
for each row execute function public.log_audit_event();
commit;
