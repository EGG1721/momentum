import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { INITIAL } from '../src/data.js';

test('Postgres enforces membership, row ownership, and atomic revision checks',async()=>{
  const db=new PGlite();
  const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202609090001_momentum.sql',import.meta.url),'utf8'));
    await db.exec(`insert into auth.users values ('${alice}'),('${bob}'),('${outsider}'); insert into public.momentum_members values ('${alice}'),('${bob}');`);
    const as=async(uid,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec(`set role ${role}`);};
    await as(alice);
    const insert=uid=>db.query('insert into public.momentum_agendas(user_id,data,revision,write_id) values($1,$2,1,$3)',[uid,JSON.stringify(INITIAL),alice]);
    await insert(alice);
    await assert.rejects(()=>insert(bob));
    await assert.rejects(()=>db.query('insert into public.momentum_members values($1)',[outsider]));
    await as(bob);assert.equal((await db.query('select * from public.momentum_agendas')).rows.length,0);
    assert.equal((await db.query('update public.momentum_agendas set revision=2 returning *')).rows.length,0);
    await as(outsider);await assert.rejects(()=>insert(outsider));
    await as('', 'anon');await assert.rejects(()=>db.query('select * from public.momentum_agendas'));
    await as(alice);
    assert.equal((await db.query('update public.momentum_agendas set revision=2 where revision=1 returning revision')).rows.length,1);
    assert.equal((await db.query('update public.momentum_agendas set revision=2 where revision=1 returning revision')).rows.length,0);
    await assert.rejects(()=>db.query('update public.momentum_agendas set data=\'{}\'::jsonb'));
    await assert.rejects(()=>db.query('delete from public.momentum_agendas'));
  } finally {await db.close();}
});
