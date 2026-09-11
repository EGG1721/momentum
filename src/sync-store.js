import { INITIAL, STORAGE_KEY, parseBackup, validateState, MAX_BACKUP_BYTES } from './data.js';

export const accountKey = uid => uid ? `momentum_cloud_v1_${uid}` : STORAGE_KEY;
const fresh = () => ({data:structuredClone(INITIAL), revision:0, dirty:false, editId:null});
const validRevision = n => Number.isSafeInteger(n) && n >= 0;
export class SyncStore {
  constructor(storage, cloud, online = () => true) {
    this.storage=storage; this.cloud=cloud; this.online=online;
    this.listeners=new Set(); this.epoch=0; this.busy=false;
    this.subscribe=fn=>{this.listeners.add(fn); return ()=>this.listeners.delete(fn);};
    this.getSnapshot=()=>this.view;
    this.selectAccount(null);
  }
  emit(extra={}) {
    this.view={...this.view, data:this.record.data, uid:this.uid, dirty:this.record.dirty, editId:this.record.editId, ...extra};
    this.listeners.forEach(fn=>fn());
  }
  selectAccount(uid) {
    this.epoch++; this.busy=false; this.uid=uid; this.key=accountKey(uid);
    this.record=fresh(); this.raw=null;
    this.view={error:'',blocked:false,conflict:null,syncing:false,status:uid?'pending':'local'};
    try {
      this.raw=this.storage.getItem(this.key);
      if (this.raw) {
        if (!uid) this.record.data=parseBackup(this.raw);
        else {
          const cached=JSON.parse(this.raw);
          if (cached.version!==1 || !validRevision(cached.revision) || typeof cached.dirty!=='boolean' || (cached.editId!==null && typeof cached.editId!=='string')) throw new Error('Formato desconocido');
          this.record={...cached,data:validateState(cached.data)};
        }
      }
    } catch {
      this.view.blocked=true;
      this.view.error='No se pudo leer la agenda. Tus datos originales se conservan. Exporta una copia de recuperación o restaura un respaldo válido.';
    }
    this.emit();
  }
  externalChange() {
    this.emit({blocked:true,error:'La agenda cambió en otra pestaña. Recarga antes de continuar.',syncing:false});
  }
  persist(record, restore=false) {
    try {
      if (!restore && this.storage.getItem(this.key)!==this.raw) {this.externalChange();return false;}
      const raw=JSON.stringify(this.uid?{...record,version:1}:record.data);
      if(raw===this.raw)return true;
      this.storage.setItem(this.key,raw); this.raw=raw;
      return true;
    } catch {
      this.emit({error:'No se pudo guardar en este dispositivo. Exporta un respaldo ahora; no se enviarán cambios a la nube hasta poder guardarlos.'});
      return false;
    }
  }
  commit(next, {restore=false}={}) {
    if (this.view.blocked && !restore) return false;
    // Check before applying, so another tab cannot overwrite a newer snapshot.
    try { if (!restore && this.storage.getItem(this.key)!==this.raw) {this.externalChange();return false;} } catch { /* persist reports failures */ }
    const data=validateState(typeof next==='function'?next(this.record.data):next);
    if(new TextEncoder().encode(JSON.stringify(data)).length>MAX_BACKUP_BYTES) throw new Error('La agenda supera 5 MB. Exporta un respaldo y reduce su tamaño.');
    const record={...this.record,data,dirty:!!this.uid,editId:crypto.randomUUID()};
    const saved=this.persist(record,restore);
    // Keep a failed write in memory for export; synchronization remains disabled.
    if (!saved && this.view.blocked) return false;
    this.record=record;
    this.emit({blocked:restore?!saved:this.view.blocked,error:saved?'':this.view.error,status:this.uid?'pending':'local'});
    return saved;
  }
  async sync() {
    if (!this.uid || !this.cloud || this.busy || this.view.blocked || this.view.conflict || this.view.error) return;
    if (!this.online()) {this.emit({status:'offline'});return;}
    const epoch=this.epoch, uid=this.uid;
    const alive=()=>epoch===this.epoch && !this.view.blocked;
    this.busy=true; this.emit({syncing:true,status:'syncing'});
    try {
      const remote=await this.cloud.read(uid);
      if (!alive()) return;
      if(remote) {
        validateState(remote.data);
        if (!validRevision(remote.revision) || remote.revision<1) throw new Error('Versión remota inválida');
      }
      const revision=remote?.revision ?? 0;
      if(this.record.dirty) {
        // A response may be lost after a successful write. Recognize that write on retry.
        if(remote && remote.write_id===this.record.editId) {
          const record={...this.record,revision,dirty:false};
          if(this.persist(record)){this.record=record;this.emit({status:'synced'});}
        } else if(revision!==this.record.revision) {
          this.emit({conflict:remote ?? {data:structuredClone(INITIAL),revision:0},status:'conflict'});
        } else {
          const sent={...this.record};
          const result=await this.cloud.write(uid,sent.data,sent.revision,sent.editId);
          if(!alive()) return;
          if(!result) {this.emit({status:'pending'});return;}
          if(result.revision!==sent.revision+1)throw new Error('Versión inesperada');
          const record={...this.record,revision:result.revision,dirty:this.record.editId!==sent.editId};
          if(this.persist(record)){this.record=record;this.emit({status:record.dirty?'pending':'synced'});}
        }
      } else if (remote) {
        const record={data:validateState(remote.data),revision,dirty:false,editId:remote.write_id};
        if(this.persist(record)){this.record=record;this.emit({status:'synced'});}
      } else if (this.record.revision>0) {
        this.emit({status:'error',error:'No se encontró tu agenda en la nube. Conservamos la copia local. Revisa los permisos del proyecto.'});
      } else this.emit({status:'synced'});
    } catch {
      if(alive()) this.emit({status:'unavailable'});
    } finally {
      if(epoch===this.epoch){this.busy=false;this.emit({syncing:false});}
    }
  }
  resolve(choice) {
    const remote=this.view.conflict;
    if(!remote || this.view.blocked) return false;
    const record=choice==='cloud'
      ? {data:validateState(remote.data),revision:remote.revision,dirty:false,editId:null}
      : {...this.record,revision:remote.revision,dirty:true,editId:crypto.randomUUID()};
    if(!this.persist(record))return false;
    this.record=record;this.emit({conflict:null,status:record.dirty?'pending':'synced'});
    return true;
  }
  recovery() { return this.view.blocked?this.storage.getItem(this.key):JSON.stringify(this.record.data); }
}
