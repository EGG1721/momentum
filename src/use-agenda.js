import { useEffect, useState, useSyncExternalStore } from 'react';
import { SyncStore } from './sync-store.js';
import { supabase, cloudAdapter } from './cloud.js';

export function useAgenda() {
  const [store]=useState(()=>new SyncStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)},supabase?cloudAdapter(supabase):null,()=>navigator.onLine));
  const view=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [user,setUser]=useState(null);
  const [authReady,setAuthReady]=useState(!supabase);
  useEffect(()=>{
    if(!supabase)return;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      const next=session?.user ?? null;
      if(store.uid!==(next?.id ?? null))store.selectAccount(next?.id ?? null);
      setUser(next);setAuthReady(true);
    });
    return ()=>subscription.unsubscribe();
  },[store]);
  useEffect(()=>{
    const receive=e=>{if(e.key===store.key || e.key===null)store.externalChange();};
    const sync=()=>{if(document.visibilityState==='visible')void store.sync();};
    window.addEventListener('storage',receive);
    window.addEventListener('online',sync);window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    const interval=setInterval(sync,60000);
    return ()=>{clearInterval(interval);window.removeEventListener('storage',receive);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};
  },[store]);
  useEffect(()=>{
    if(!authReady)return;
    const timer=setTimeout(()=>void store.sync(),800);
    return ()=>clearTimeout(timer);
  },[store,authReady,view.uid,view.editId,view.dirty]);
  return {store,view,user,authReady};
}
