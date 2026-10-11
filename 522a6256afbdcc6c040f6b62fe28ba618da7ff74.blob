import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {dueHalloweenScare,canTriggerHalloweenScare}=await loadTs('../lib/halloween-timing.ts');
test('150-second monster has priority at 300 seconds and bypasses a recent random clown cooldown',()=>{
  for(const seconds of [60,120,180,240]) assert.equal(dueHalloweenScare(seconds),'clown');
  for(const seconds of [150,300,450,600]) assert.equal(dueHalloweenScare(seconds),'monster');
  for(const seconds of [0,59,149,299]) assert.equal(dueHalloweenScare(seconds),null);
  assert.equal(canTriggerHalloweenScare('clown',300000,298000),false);
  assert.equal(canTriggerHalloweenScare('monster',300000,298000),true);
  assert.equal(canTriggerHalloweenScare('monster',300000,298000,true),false);
});
