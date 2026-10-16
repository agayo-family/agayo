import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const themes=await loadTs('../lib/admin-ticket-theme.ts');
test('opening and resaving an event preserves a category palette independently of edited event colors',()=>{
  const category=themes.storedAdminTicketTheme({theme_primary:'#112233',theme_secondary:'#445566',theme_accent:'#778899'});
  const event={themePrimary:'#990000',themeSecondary:'#880000',themeAccent:'#ff0000'};
  assert.deepEqual(themes.adminTicketThemePayload(category,event),{themePrimary:'#112233',themeSecondary:'#445566',themeAccent:'#778899'});
  assert.deepEqual(themes.adminTicketThemePayload({},event),event);
  assert.equal(themes.adminTicketThemePayload({themePrimary:'url(evil)'},event).themePrimary,'#990000');
});
