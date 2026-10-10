import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { getEventCatalogBadge, isEventOnOrAfterToday, partitionEvents } = await loadTs('../lib/events.ts');
const now = new Date('2026-10-10T13:00:00Z');
const event = (slug, startsAt, salesState='open', status='published', endsAt=undefined) => ({ slug, startsAt, salesState, status, endsAt });

test('closing a future sale never moves the event into the archive', () => {
  assert.equal(getEventCatalogBadge(event('next','2026-11-07T17:30:00+03:00','closed'),now),'soon');
});
test('past events remain archived even with an open sale flag', () => {
  assert.equal(getEventCatalogBadge(event('past','2026-09-12T17:30:00+03:00'),now),'archive');
});
test('an explicit end time closes sales on the same Moscow date', () => {
  const ended = event('today','2026-10-10T11:00:00+03:00','open','published','2026-10-10T15:00:00+03:00');
  assert.equal(getEventCatalogBadge(ended,now),'archive');
  assert.equal(isEventOnOrAfterToday(ended,now),false);
});
test('cross-midnight UTC dates are classified by Moscow time', () => {
  assert.equal(getEventCatalogBadge(event('same-day','2026-10-10T00:30:00+03:00'),new Date('2026-10-09T22:00:00Z')),'tickets');
});
test('a corrupt event date can never enable ticket checkout', () => {
  assert.equal(getEventCatalogBadge(event('invalid','not-a-date'),now),'soon');
  assert.equal(isEventOnOrAfterToday(event('invalid','not-a-date'),now),false);
});
test('catalog hides drafts/cancellations and sorts each section in the useful direction', () => {
  const items=[event('late','2026-12-01'),event('older','2026-08-01'),event('draft','2026-10-20','open','draft'),event('early','2026-11-01','closed'),event('cancel','2026-10-15','open','cancelled'),event('recent','2026-09-15')];
  const result=partitionEvents(items,now);
  assert.deepEqual(result.upcoming.map(x=>x.slug),['early','late']);
  assert.deepEqual(result.archive.map(x=>x.slug),['recent','older']);
  assert.equal(items[0].slug,'late');
});
