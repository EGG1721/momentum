import { useState } from 'react';
import { supabase, configError } from './cloud.js';
import { STORAGE_KEY, parseBackup } from './data.js';

export default function CloudPanel({store,view,user,authReady,exportBackup}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const login=async e=>{
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error)throw error;
      setPassword('');
    } catch {setMessage('No se pudo iniciar sesión. Revisa tus credenciales y la conexión.');}
    finally {setBusy(false);}
  };
  const logout=async()=>{
    if(!confirm(view.dirty?'Hay cambios pendientes de sincronizar. Se conservarán en este dispositivo para esta cuenta. ¿Cerrar sesión?':'¿Cerrar sesión? La copia local de esta cuenta permanecerá en este dispositivo.'))return;
    setBusy(true);
    try {const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;}
    catch {setMessage('No se pudo cerrar sesión. Intenta de nuevo.');}
    finally {setBusy(false);}
  };
  const migrate=()=>{
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw){setMessage('No hay una agenda anterior en este navegador. Puedes importar un respaldo.');return;}
      const data=parseBackup(raw);
      if(!confirm('Copiar la agenda local anterior a esta cuenta reemplazará la agenda que estás viendo. Exporta antes un respaldo. ¿Continuar?'))return;
      if(store.commit(data))setMessage('Copia preparada para sincronizar. La agenda local anterior se conserva.');
    } catch {setMessage('No se pudo copiar la agenda anterior. Exporta una copia de recuperación desde el modo local.');}
  };
  const resolve=choice=>{
    if(!confirm('Se descargará un respaldo de tu copia local antes de usar '+(choice==='cloud'?'la versión de la nube.':'la versión de este dispositivo y reemplazar la nube.')+' ¿Continuar?'))return;
    if(exportBackup()===false)return;
    if(store.resolve(choice))void store.sync();
  };
  const exportCloud=()=>{
    const raw=JSON.stringify({app:'momentum',version:1,exportedAt:new Date().toISOString(),data:view.conflict.data},null,2);
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='momentum-conflicto-nube.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  const labels={local:'Guardado local',pending:'Cambios pendientes de subir',syncing:'Sincronizando…',synced:'Sincronizado con Supabase',offline:'Sin conexión · guardado local',unavailable:'Nube no disponible · se conserva la copia local. Revisa conexión, sesión, permisos o pausa de Supabase.',conflict:'Hay cambios diferentes en otro dispositivo',error:'Sincronización detenida'};
  return <section className="cloud-panel" aria-label="Cuenta y sincronización">
    <strong>Tu agenda, contigo</strong>
    {!supabase ? <p>{configError || 'Modo local. La conexión con Supabase se activará al configurar el proyecto.'}</p> : !authReady ? <p>Comprobando sesión…</p> : !user ? <>
      <p>Inicia sesión para guardar y recuperar tu agenda en la nube. La agenda local se mantiene separada.</p>
      <form onSubmit={login} className="login-form">
        <label>Correo<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button disabled={busy} type="submit">{busy?'Entrando…':'Iniciar sesión'}</button>
      </form>
      <small>Acceso solo para la cuenta autorizada. Si olvidaste tu contraseña, restablécela desde la administración de Supabase.</small>
    </> : <>
      <p>{user.email}</p><p role="status">{labels[view.status] ?? labels.pending}</p>
      <div className="cloud-actions"><button disabled={view.syncing || !!view.conflict || view.blocked} onClick={()=>void store.sync()}>Sincronizar ahora</button><button onClick={migrate}>Copiar agenda local anterior</button><button disabled={busy} onClick={logout}>Cerrar sesión</button></div>
      {view.conflict && <div className="notice"><p>Ambas copias tienen cambios. No sobrescribimos ninguna automáticamente. Exporta los respaldos y elige qué versión conservar; no se combinarán.</p><button onClick={exportCloud}>Exportar copia de la nube</button><button onClick={()=>resolve('cloud')}>Usar versión de la nube</button><button onClick={()=>resolve('local')}>Usar versión de este dispositivo</button></div>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
