import {describe,it,expect} from 'vitest';
import {normalizePhone,whatsappUrl,operatorContact} from '../../features/contacts/logic';
describe('supplier WhatsApp routing',()=>{
 it('normalizes Costa Rican numbers without guessing a country',()=>expect(normalizePhone('+506 8583-8604')).toBe('50685838604'));
 it('rejects URLs and invalid phone input',()=>{expect(()=>normalizePhone('https://evil.test')).toThrow();expect(()=>normalizePhone('123')).toThrow();});
 it('encodes message text into a single parameter',()=>expect(whatsappUrl('+506 85838604','Room 4 & 5\nA/C')).toBe('https://wa.me/50685838604?text=Room%204%20%26%205%0AA%2FC'));
 it('matches exact linked operator, never a similar supplier',()=>{const contacts=[{id:'a',name:'Carlos',operator_name:'Ballena Tours',phone:'50685838604',category:'tour',notes:''}];expect(operatorContact(contacts,' ballena tours ')?.id).toBe('a');expect(operatorContact(contacts,'Ballena')).toBeUndefined();});
});
