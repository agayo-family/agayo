import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, loadTsx } from './load-ts.mjs';
const events = await loadTs('../lib/events.ts');
const { defaultAboutContent } = await loadTs('../lib/about-content.ts');
const presentation = await loadTs('../lib/event-presentation.ts');
const { default: UpcomingAgenda } = await loadTsx('../components/UpcomingAgenda.tsx', { '@/lib/events': events, '@/lib/event-presentation': presentation });
const { default: AboutContentView } = await loadTsx('../components/AboutContentView.tsx');
const event = (slug, day, salesState = 'open') => ({ ...events.events[0], slug, title: `Встреча ${slug}`, startsAt: `2080-11-${day}T18:00:00+03:00`, dateLabel: `${day}.11.80`, salesState });

test('agenda keeps chronological cards and stable links, shows only the first and offers manual arrows', () => {
  const items = [event('first', '01'), event('second', '10', 'closed'), event('третий', '20', 'coming-soon')];
  const html = renderToStaticMarkup(createElement(UpcomingAgenda, { events: items }));
  for (const item of items) assert.ok(html.includes(item.title) && html.includes(item.dateLabel));
  assert.ok(html.includes('href="/events/first#tickets"'));
  assert.ok(html.includes('href="/events/second"'));
  assert.ok(html.includes(`href="/events/${encodeURIComponent('третий')}"`));
  assert.equal(html.includes('/events/second#tickets'), false);
  assert.equal((html.match(/hidden=""/g)||[]).length,2);
  assert.ok(html.includes('Следующее мероприятие') && html.includes('Предыдущее мероприятие'));
  assert.ok(html.includes('Билеты скоро') && html.includes('Продажа закрыта'));
});
test('hidden organizer cards and their photo URLs never appear in public markup; text is escaped', () => {
  const content = { ...defaultAboutContent, organizers: [
    { id: 'visible', name: '<script>portrait</script>', role: 'Команда', description: 'Описание организатора', photoUrl: '', photoAlt: '', visible: true },
    { id: 'hidden', name: 'HIDDEN ORGANIZER', role: 'hidden', description: 'INTERNAL DRAFT', photoUrl: '/private-draft-photo.jpg', photoAlt: '', visible: false },
  ] };
  const html = renderToStaticMarkup(createElement(AboutContentView, { content }));
  assert.ok(html.includes('Описание организатора') && html.includes('&lt;script&gt;portrait&lt;/script&gt;'));
  for (const privateValue of ['HIDDEN ORGANIZER', 'INTERNAL DRAFT', '/private-draft-photo.jpg', '<script>portrait</script>']) assert.equal(html.includes(privateValue), false);
});
