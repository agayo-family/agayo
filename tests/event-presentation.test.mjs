import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './load-ts.mjs';
const {isHalloweenEvent}=await loadTs('../lib/event-presentation.ts');

test('Halloween effects remain with the original event and do not spread to future Halloween events',()=>{
  assert.equal(isHalloweenEvent({slug:'agayo-halloween-история-одного-клоуна',title:'Новое название архива'}),true);
  assert.equal(isHalloweenEvent({slug:'renamed-original-event',title:'AGAYO HALLOWEEN: ПОСЛЕДНЯЯ УЛЫБКА'}),true);
  assert.equal(isHalloweenEvent({slug:'halloween-2027',title:'AGAYO HALLOWEEN 2027'}),false);
  assert.equal(isHalloweenEvent({slug:'summer',title:'Без клоунов'}),false);
});

test('event introduction keeps its dark event palette through the complete global stylesheet cascade',async()=>{
  const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
  const files=[...layout.matchAll(/import\s+["']\.\/([^"']+\.css)["']/g)].map(match=>match[1]);
  const winners=new Map();
  let order=0;
  for(const file of files){
    const css=(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'');
    for(const [,selectors,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      const declarations=[...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)];
      if(selectors.includes('.event-v2-intro')){
        for(const [,property,value] of declarations){
          if(['color','background','background-color','border-color'].includes(property)){
            assert.doesNotMatch(value,/!\s*important/i,`${file}: fixed high-priority intro colors override the selected event palette`);
          }
        }
      }
      for(const selector of selectors.split(',').map(value=>value.trim())){
        // The real intro is a descendant of both event-page wrapper classes.
        if(!/^(?:(?:\.event-page-v2|\.event-page-themed)\s+)*\.event-v2-intro$/.test(selector))continue;
        const specificity=(selector.match(/\./g)||[]).length;
        for(const [,property,value] of declarations){
          if(!['background','color'].includes(property))continue;
          const important=/!\s*important/i.test(value);
          const candidate={value:value.replace(/!\s*important/i,'').trim(),important,specificity,order:order++};
          const previous=winners.get(property);
          if(!previous||Number(important)>Number(previous.important)||important===previous.important&&(specificity>previous.specificity||specificity===previous.specificity&&candidate.order>previous.order))winners.set(property,candidate);
        }
      }
    }
  }
  assert.equal(winners.get('color')?.value.toLowerCase(),'#f2f0ea');
  const background=winners.get('background')?.value||'';
  assert.match(background,/var\(--event-primary/);
  assert.match(background,/var\(--event-secondary/);
  assert.match(background,/#0b0b0c/i);
  assert.doesNotMatch(background,/--paper|--agayo-milk|#f2f0ea/i);
});
