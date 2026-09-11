import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncStore,accountKey } from '../src/sync-store.js';
import { INITIAL,STORAGE_KEY } from '../src/data.js';
import { readConfig,configureHeaders } from '../src/cloud-config.js';
const data=name=>({...structuredClone(INITIAL),tasks:[{id:name,name,priority:'med',done:false}]});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
function cloud(){return {rows:new Map(),async read(uid){return structuredClone(this.rows.get(uid)??null);},async write(uid,data,revision,write_id){if((this.rows.get(uid)?.revision??0)!==revision)return null;const row={data:structuredClone(data),revision:revision+1,write_id};this.rows.set(uid,row);return {revision:row.revision};}};}
test('offline edits survive reload and upload on reconnect',async()=>{
  const disk=storage(),remote=cloud();let online=false;
  const a=new SyncStore(disk,remote,()=>online);a.selectAccount('alice');a.commit(data('offline'));await a.sync();
  assert.equal(a.view.status,'offline');assert.equal(remote.rows.size,0);
  const b=new SyncStore(disk,remote,()=>online);b.selectAccount('alice');assert.equal(b.view.data.tasks[0].name,'offline');
  online=true;await b.sync();assert.equal(b.view.dirty,false);assert.equal(remote.rows.get('alice').data.tasks[0].name,'offline');
});
test('accounts and legacy agenda remain separate; logout hides account data',async()=>{
  const disk=storage();disk.setItem(STORAGE_KEY,JSON.stringify(data('legacy')));
  const a=new SyncStore(disk,cloud());assert.equal(a.view.data.tasks[0].name,'legacy');
  a.selectAccount('alice');assert.equal(a.view.data.tasks.length,0);a.commit(data('private'));
  a.selectAccount('bob');assert.equal(a.view.data.tasks.length,0);
  a.selectAccount(null);assert.equal(a.view.data.tasks[0].name,'legacy');
  a.selectAccount('alice');assert.equal(a.view.data.tasks[0].name,'private');
});
test('two devices preserve conflicting edits until explicit resolution',async()=>{
  const remote=cloud(),a=new SyncStore(storage(),remote),b=new SyncStore(storage(),remote);
  a.selectAccount('alice');b.selectAccount('alice');a.commit(data('first'));await a.sync();await b.sync();
  a.commit(data('phone'));b.commit(data('computer'));await a.sync();await b.sync();
  assert.equal(b.view.status,'conflict');assert.equal(b.view.data.tasks[0].name,'computer');
  assert.equal(remote.rows.get('alice').data.tasks[0].name,'phone');
  b.resolve('local');await b.sync();assert.equal(remote.rows.get('alice').data.tasks[0].name,'computer');
  await a.sync();assert.equal(a.view.data.tasks[0].name,'computer');
});
test('lost write response is recognized on retry, without duplicates',async()=>{
  const remote=cloud(),write=remote.write.bind(remote);let fail=true;
  remote.write=async(...args)=>{const result=await write(...args);if(fail){fail=false;throw new Error('lost');}return result;};
  const a=new SyncStore(storage(),remote);a.selectAccount('alice');a.commit(data('saved'));await a.sync();
  assert.equal(a.view.dirty,true);await a.sync();assert.equal(a.view.dirty,false);assert.equal(a.view.conflict,null);assert.equal(remote.rows.get('alice').revision,1);
});
test('edits while a write is in flight remain pending and are sent next',async()=>{
  const remote=cloud();const write=remote.write.bind(remote);let release,started;
  const ready=new Promise(r=>started=r);
  remote.write=async(...args)=>{started();await new Promise(r=>release=r);return write(...args);};
  const a=new SyncStore(storage(),remote);a.selectAccount('alice');a.commit(data('first'));
  const syncing=a.sync();await ready;a.commit(data('second'));release();await syncing;
  assert.equal(a.view.dirty,true);assert.equal(a.view.data.tasks[0].name,'second');
  remote.write=write;await a.sync();assert.equal(remote.rows.get('alice').data.tasks[0].name,'second');
});
test('account switch ignores a delayed response for another account',async()=>{
  let release;const remote={read:()=>new Promise(r=>release=r)};
  const a=new SyncStore(storage(),remote);a.selectAccount('alice');const pending=a.sync();
  a.selectAccount('bob');release({data:data('alice-secret'),revision:1});await pending;
  assert.equal(a.view.uid,'bob');assert.equal(a.view.data.tasks.length,0);
});
test('stale tab cannot silently overwrite a newer local snapshot',()=>{
  const disk=storage(),a=new SyncStore(disk,cloud()),b=new SyncStore(disk,cloud());
  a.selectAccount('alice');b.selectAccount('alice');a.commit(data('new'));
  assert.equal(b.commit(data('stale')),false);assert.equal(b.view.blocked,true);
  assert.equal(JSON.parse(disk.getItem(accountKey('alice'))).data.tasks[0].name,'new');
});
test('malformed account cache is preserved and blocks upload',async()=>{
  const disk=storage(),remote=cloud();disk.setItem(accountKey('alice'),'{broken');
  const a=new SyncStore(disk,remote);a.selectAccount('alice');await a.sync();
  assert.equal(a.view.blocked,true);assert.equal(a.recovery(),'{broken');assert.equal(remote.rows.size,0);
  assert.equal(a.commit(data('restored'),{restore:true}),true);await a.sync();assert.equal(a.view.dirty,false);
});
test('storage failure preserves in-memory changes for export and prevents upload',async()=>{
  const disk=storage(),remote=cloud();const a=new SyncStore(disk,remote);a.selectAccount('alice');
  disk.setItem=()=>{throw new Error('quota');};assert.equal(a.commit(data('recoverable')),false);await a.sync();
  assert.match(a.recovery(),/recoverable/);assert.equal(remote.rows.size,0);
});
test('cloud downtime preserves local data and reconnect retries',async()=>{
  const remote=cloud(),read=remote.read.bind(remote);remote.read=()=>{throw new Error('paused');};
  const a=new SyncStore(storage(),remote);a.selectAccount('alice');a.commit(data('pending'));await a.sync();
  assert.equal(a.view.status,'unavailable');assert.equal(a.view.dirty,true);
  remote.read=read;await a.sync();assert.equal(a.view.status,'synced');
});
test('private or malformed configuration is rejected; CSP allows only selected project',()=>{
  const env={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_public_example'};
  assert.ok(readConfig(env).clientConfig);
  for(const key of ['sb_secret_private','eyJhbGciOiJIUzI1NiJ9',''])assert.ok(readConfig({...env,VITE_SUPABASE_PUBLISHABLE_KEY:key}).error);
  assert.ok(readConfig({...env,VITE_SUPABASE_URL:'https://attacker.example'}).error);
  assert.equal(configureHeaders("connect-src 'self';",env),"connect-src 'self' https://example.supabase.co;");
});
