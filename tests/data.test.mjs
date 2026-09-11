import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL, validateState, parseBackup, todayKey, blocksOnDay, secondsRemaining } from '../src/data.js';
const block = {id:'block-1',title:'Cita',start:'01:00',end:'02:00',cat:'personal',repeat:'once',date:'2026-09-08',doneLog:{},skipLog:{}};
test('one-off blocks are only shown on their selected date',()=>{
  assert.equal(blocksOnDay([block],'2026-09-08').length,1);
  assert.equal(blocksOnDay([block],'2026-09-09').length,0);
});
test('weekday and weekend recurrences',()=>{
  const blocks=[{...block,repeat:'weekdays'},{...block,id:'2',repeat:'weekends'}];
  assert.equal(blocksOnDay(blocks,'2026-09-08')[0].repeat,'weekdays');
  assert.equal(blocksOnDay(blocks,'2026-09-12')[0].repeat,'weekends');
});
test('calendar uses local day at night in El Salvador',()=>{
  process.env.TZ='America/El_Salvador';
  assert.equal(todayKey(new Date('2026-09-09T03:30:00Z')),'2026-09-08');
});
test('timer accounts for background suspension without negative values',()=>{
  assert.equal(secondsRemaining(60000,42500),18);
  assert.equal(secondsRemaining(60000,120000),0);
});
test('both legacy and versioned backups round-trip',()=>{
  const data={...INITIAL,blocks:[block]};
  assert.deepEqual(parseBackup(JSON.stringify(data)),data);
  assert.deepEqual(parseBackup(JSON.stringify({app:'momentum',version:1,data})),data);
  const old={...INITIAL}; delete old.blocks;
  assert.deepEqual(validateState(old),INITIAL);
});
test('invalid data never becomes application state',()=>{
  for(const data of [null,[],{}, {...INITIAL,tasks:[null]}, {...INITIAL,blocks:[{...block,end:'00:30'}]}, {...INITIAL,blocks:[{...block,date:'2026-02-31'}]}, {...INITIAL,blocks:[block,block]}, {...INITIAL,log:{'__bad__':{}}}]) {
    assert.throws(()=>validateState(data));
  }
  assert.throws(()=>parseBackup('{broken'));
  assert.throws(()=>parseBackup(JSON.stringify({app:'momentum',version:2,data:INITIAL})));
  assert.throws(()=>parseBackup(' '.repeat(5*1024*1024+1)));
});
