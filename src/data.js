export const STORAGE_KEY = 'momentum_v4';
export const INITIAL = { habits: [], tasks: [], log: {}, sessions: [], blocks: [] };
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && todayKey(new Date(v+'T12:00:00')) === v;
const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const id = v => text(v,100) && /^[a-zA-Z0-9_-]+$/.test(v) && !['__proto__','constructor','prototype'].includes(v);
const optionalText = v => v === undefined || v === null || text(v);
const optionalDate = v => v === undefined || v === null || v === '' || date(v);
const choices = (v, values) => values.includes(v);
const fail = () => { throw new Error('Los datos no tienen un formato válido de Momentum. No se reemplazó tu agenda.'); };
function dateMap(value, validate) {
  if (!object(value) || !Object.entries(value).every(([k,v]) => date(k) && validate(v))) fail();
  return value;
}
export function validateState(input) {
  if (!object(input)) fail();
  const s = structuredClone(input);
  if (s.blocks === undefined) s.blocks = []; // Migration for earlier backups.
  for (const key of ['habits','tasks','sessions','blocks']) {
    if (!Array.isArray(s[key]) || s[key].length > 20000 || !s[key].every(object)) fail();
    if (key !== 'sessions' && (!s[key].every(x=>id(x.id)) || new Set(s[key].map(x=>x.id)).size !== s[key].length)) fail();
  }
  if (!s.habits.every(h=>text(h.name) && h.name.trim() && choices(h.category,['salud','mente','trabajo','aprender','personal']) && time(h.time) && optionalText(h.why) && optionalDate(h.createdAt))) fail();
  if (!s.tasks.every(t=>text(t.name) && t.name.trim() && choices(t.priority,['high','med','low']) && typeof t.done==='boolean' && optionalDate(t.due) && optionalDate(t.doneAt) && optionalDate(t.createdAt) && optionalText(t.note))) fail();
  if (!s.sessions.every(x=>date(x.date) && text(x.task) && Number.isFinite(x.mins) && x.mins>0 && x.mins<=1440)) fail();
  dateMap(s.log, v => object(v) && Object.entries(v).every(([k,status])=>id(k) && choices(status,['done','skipped','partial'])));
  for (const b of s.blocks) {
    if (!text(b.title) || !b.title.trim() || !time(b.start) || !time(b.end) || b.end<=b.start || !choices(b.cat,['rutina','ejercicio','trabajo','aprender','personal','descanso','comida','ocio']) || !choices(b.repeat,['daily','weekdays','weekends','once']) || !optionalText(b.notes) || !optionalDate(b.date) || (b.repeat==='once' && !date(b.date))) fail();
    b.doneLog ??= {};
    b.skipLog ??= {};
    dateMap(b.doneLog,v=>typeof v==='boolean');
    dateMap(b.skipLog,v=>typeof v==='boolean');
  }
  return Object.fromEntries(Object.keys(INITIAL).map(k=>[k,s[k]]));
}
export function parseBackup(raw) {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('El respaldo supera el límite de 5 MB.');
  const parsed = JSON.parse(raw);
  if (parsed?.app === 'momentum') {
    if (parsed.version !== 1) throw new Error('Versión de respaldo no compatible.');
    return validateState(parsed.data);
  }
  return validateState(parsed);
}
export function blocksOnDay(blocks, day) {
  const dow = new Date(day+'T12:00:00').getDay();
  return blocks.filter(b=> b.repeat==='daily' || (b.repeat==='once' && b.date===day) || (b.repeat==='weekdays' && dow>=1 && dow<=5) || (b.repeat==='weekends' && (dow===0 || dow===6))).sort((a,b)=>a.start.localeCompare(b.start));
}
export const secondsRemaining = (deadline, now = Date.now()) => Math.max(0, Math.ceil((deadline-now)/1000));
