import { createClient } from '@supabase/supabase-js';
import { readConfig } from './cloud-config.js';
const config=readConfig(import.meta.env);
export const configError=config.error;
async function timedFetch(input,init={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,15000);
  try {return await fetch(input,{...init,signal:controller.signal});}
  finally {clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
}
export const supabase=config.clientConfig ? createClient(config.clientConfig.url,config.clientConfig.key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'},
  global:{fetch:timedFetch},
}) : null;
export function cloudAdapter(client) {
  return {
    async read(uid) {
      const {data:member,error:membershipError}=await client.from('momentum_members').select('user_id').eq('user_id',uid).maybeSingle();
      if(membershipError || !member)throw new Error('Cuenta no autorizada');
      const {data,error}=await client.from('momentum_agendas').select('data,revision,write_id').eq('user_id',uid).maybeSingle();
      if(error)throw error;
      return data;
    },
    async write(uid,data,revision,writeId) {
      const row={data,revision:revision+1,write_id:writeId};
      const query=revision===0
        ? client.from('momentum_agendas').insert({...row,user_id:uid})
        : client.from('momentum_agendas').update(row).eq('user_id',uid).eq('revision',revision);
      const result=await query.select('revision').maybeSingle();
      if(result.error?.code==='23505')return null; // Another device created the row first.
      if(result.error)throw result.error;
      return result.data;
    },
  };
}
