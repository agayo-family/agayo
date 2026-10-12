import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, loadTsx } from './load-ts.mjs';
const permissions = await loadTs('../lib/admin-permissions.ts');
const noop = () => null;
const { default: AdminMediaManager } = await loadTsx('../components/AdminMediaManager.tsx', { '@/lib/client/upload': { uploadAdminFile: () => { throw new Error('Unexpected upload'); } } });
const { default: AdminDashboard } = await loadTsx('../components/AdminDashboard.tsx', {
  'next/dynamic': () => noop, './TeamAccessPanel': noop, './AdminEventsManager': noop,
  './AdminMediaManager': AdminMediaManager, './AdminPeriodSummary': noop,
  '@/lib/admin-permissions': permissions, './admin-navigation.css': {},
});
const base = { userId: 'test', agayoId: 'TEST', email: null, displayName: null, role: 'owner', permissions: [], allEvents: true, eventSlugs: [], bootstrapOwner: false };
const render = access => renderToStaticMarkup(createElement(AdminDashboard, { access, previewMode: true }));

test('admin navigation distinguishes public About editing from employee access management', () => {
  const html = render(base);
  assert.match(html, /data-admin-tab="about"/);
  assert.match(html, /Публичная команда AGAYO/);
  assert.match(html, /Сотрудники и права доступа/);
  assert.doesNotMatch(html, /admin-about-shortcut|Фото и отзывы/);
});
test('the photo section keeps uploads and exposes no review or voice controls', () => {
  const html = render({ ...base, role: 'organizer', permissions: ['manage_media'] });
  assert.match(html, /Добавить фотографии/);
  assert.match(html, />Фото<\/span>/);
  assert.doesNotMatch(html, /Добавить отзыв|ОТЗЫВЫ|ГОЛОСОВОЙ ОТЗЫВ|audio\/\*|<audio/);
  assert.doesNotMatch(html, /data-admin-tab="about"|data-admin-tab="team"/);
});
test('an explicitly authorized content editor can open About without employee-management rights', () => {
  const html = render({ ...base, role: 'administrator', permissions: ['manage_about'] });
  assert.match(html, /data-admin-tab="about" aria-current="page"/);
  assert.doesNotMatch(html, /data-admin-tab="team"/);
});
