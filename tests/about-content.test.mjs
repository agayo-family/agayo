import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { defaultAboutContent, parseAboutContent, parseContentVersion, isOrganizerPhotoUrl } = await loadTs('../lib/about-content.ts');

const person = (patch = {}) => ({ id: 'organizer-a', name: 'Имя организатора', role: 'Организация', description: 'Описание\nВторая строка', photoUrl: '/events/vernite-lampovost-poster.jpg', photoAlt: 'Портрет', visible: true, ...patch });

test('about edits preserve multiline text, normalize blank tags and organizer visibility', () => {
  const input = { ...defaultAboutContent, title: ' Команда\nAGAYO ', tags: [' 14+ ', '', 'Йошкар-Ола'], organizers: [person(), person({ id: 'organizer-b', visible: false })] };
  const parsed = parseAboutContent(input);
  assert.equal(parsed.title, 'Команда\nAGAYO');
  assert.deepEqual(parsed.tags, ['14+', 'Йошкар-Ола']);
  assert.equal(parsed.organizers[1].visible, false);
  assert.equal(input.tags[0], ' 14+ ');
});
test('portraits accept managed images and reject unsafe schemes, credentials and unrelated hosts', () => {
  for (const url of ['', '/events/vernite-lampovost-poster.jpg', 'https://store.public.blob.vercel-storage.com/agayo/uploads/organizer/portrait.jpg']) assert.equal(isOrganizerPhotoUrl(url), true);
  for (const url of ['data:image/svg+xml,<svg/>', 'javascript:alert(1)', '//example.com/photo.jpg', '/photo.svg', '/../../photo.jpg', 'https://127.0.0.1/photo.jpg', 'https://store.public.blob.vercel-storage.com.evil.com/photo.jpg', 'https://name:password@store.public.blob.vercel-storage.com/photo.jpg']) assert.equal(isOrganizerPhotoUrl(url), false);
});
test('incomplete, duplicate or excessive organizer cards cannot publish', () => {
  for (const organizers of [[person({ name: '' })], [person(), person()], [person({ visible: 'false' })], Array.from({ length: 25 }, (_, index) => person({ id: `person-${index}` }))]) assert.throws(() => parseAboutContent({ ...defaultAboutContent, organizers }));
  assert.throws(() => parseAboutContent({ ...defaultAboutContent, intro: 'x'.repeat(3001) }));
  assert.throws(() => parseAboutContent({ ...defaultAboutContent, organizers: [person({ photoUrl: 'https://example.com/photo.jpg' })] }));
});
test('version checks reject coercion that could bypass a concurrent-edit guard', () => {
  assert.equal(parseContentVersion(0), 0);
  assert.equal(parseContentVersion(17), 17);
  for (const value of ['1', null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseContentVersion(value));
});
