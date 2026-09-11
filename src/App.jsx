import { useState, useEffect, useRef, useCallback } from "react";

import { INITIAL, todayKey, parseBackup, blocksOnDay, secondsRemaining, MAX_BACKUP_BYTES } from './data.js';
import './styles.css';
import { useAgenda } from './use-agenda.js';
import CloudPanel from './CloudPanel.jsx';
const uid = () => crypto.randomUUID();

function getLast30() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return todayKey(d);
  });
}
function getWeek7() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return todayKey(d);
  });
}
function getStreak(hid, log) {
  let s = 0;
  for (let i = 1; i <= 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = todayKey(d);
    if (log[k]?.[hid] === "done") s++; else break;
  }
  if (log[todayKey()]?.[hid] === "done") s++;
  return s;
}

// Time helpers
function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minsToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}
function fmtDisplay(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2,"0")} ${ampm}`;
}
function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

const QUOTES = [
  { text: "Una mejora del 1% no es notable, pero a largo plazo puede ser enorme.", author: "James Clear" },
  { text: "La disciplina es elegir entre lo que quieres ahora y lo que más quieres.", author: "Abraham Lincoln" },
  { text: "No rompas la cadena. Cada día que actúas cuenta.", author: "Jerry Seinfeld" },
  { text: "Pequeñas acciones repetidas crean grandes transformaciones.", author: "Momentum" },
  { text: "No necesitas ser grande para empezar, pero sí empezar para ser grande.", author: "Zig Ziglar" },
  { text: "El secreto está en empezar. Eso es lo más difícil.", author: "Mark Twain" },
  { text: "Cada día trae una nueva oportunidad de mejorar 1%.", author: "Momentum" },
];

const CAT_ICONS  = { salud:"💪", mente:"🧠", trabajo:"💼", aprender:"📚", personal:"⭐" };
const PRI_COLORS = { high:"#ef4444", med:"#f59e0b", low:"#10b981" };
const PRI_LABELS = { high:"Alta", med:"Media", low:"Baja" };

// Block category palette
const BLOCK_CATS = [
  { id:"rutina",    label:"Rutina",     color:"#f59e0b", icon:"⏰" },
  { id:"ejercicio", label:"Ejercicio",  color:"#10b981", icon:"💪" },
  { id:"trabajo",   label:"Trabajo",    color:"#60a5fa", icon:"💼" },
  { id:"aprender",  label:"Aprender",   color:"#a78bfa", icon:"📚" },
  { id:"personal",  label:"Personal",   color:"#f472b6", icon:"⭐" },
  { id:"descanso",  label:"Descanso",   color:"#94a3b8", icon:"☕" },
  { id:"comida",    label:"Comida",     color:"#fb923c", icon:"🍽" },
  { id:"ocio",      label:"Libre",      color:"#a69b90", icon:"🎮" },
];
const catById = (id) => BLOCK_CATS.find(c => c.id === id) || BLOCK_CATS[0];


// blocks: [{ id, title, start, end, cat, repeat:"daily"|"weekdays"|"weekends"|"once", doneLog:{}, skipLog:{} }]

// ════════════════════════════════════════════════════════
export default function App() {
  const {store,view,user,authReady}=useAgenda();
  const state=view.data, loaded=authReady;
  const storageError=view.error, loadError=view.blocked;
  const [page, setPage]     = useState("today");
  const [modal, setModal]   = useState(null);
  const [taskTab, setTaskTab] = useState("pending");
  const [schedDay, setSchedDay] = useState(todayKey());
  const [currentTime, setCurrentTime] = useState(nowMins());

  // Focus
  const [focusMins, setFocusMins]     = useState(25);
  const [focusLeft, setFocusLeft]     = useState(25*60);
  const [focusTotal, setFocusTotal]   = useState(25*60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusTask, setFocusTask]     = useState("");
  const timerRef = useRef(null);
  const deadlineRef = useRef(null);
  const activeSessionRef = useRef(null);
  const stateRef = useRef(INITIAL);
  const [notice, setNotice] = useState('');

  const importRef = useRef(null);
  const timelineRef = useRef(null);

  // Forms
  const [hForm, setHForm] = useState({ name:"", category:"salud", time:"08:00", why:"" });
  const [tForm, setTForm] = useState({ name:"", priority:"med", due:"", note:"" });
  const [bForm, setBForm] = useState({ title:"", start:"06:00", end:"06:30", cat:"rutina", repeat:"daily", notes:"" });

  stateRef.current=state;
  useEffect(()=>{
    setFocusRunning(false);activeSessionRef.current=null;setFocusLeft(focusMins*60);
    setModal(null);setNotice('');setFocusTask('');
    setHForm({name:'',category:'salud',time:'08:00',why:''});
    setTForm({name:'',priority:'med',due:'',note:''});
    setBForm({title:'',start:'06:00',end:'06:30',cat:'rutina',repeat:'daily',notes:''});
  },[view.uid]);

  useEffect(() => {
    const tick = () => setCurrentTime(nowMins());
    const t = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(t); window.removeEventListener('focus', tick); };
  }, []);

  const save = useCallback((next) => {
    try {
      const saved=store.commit(next);
      if(!saved)setNotice('No se pudo guardar. Revisa el aviso y exporta un respaldo.');
      return saved;
    } catch(e){setNotice(e.message);return false;}
  }, [store]);

  useEffect(() => {
    if (!focusRunning) return;
    let finished = false;
    const tick = () => {
      const remaining = secondsRemaining(deadlineRef.current);
      setFocusLeft(remaining);
      if (remaining === 0 && !finished) {
        finished = true;
        clearInterval(timerRef.current);
        setFocusRunning(false);
        const session = activeSessionRef.current;
        if (session) save(prev => ({...prev, sessions:[...prev.sessions, {...session, date:todayKey(new Date(deadlineRef.current))}]}));
        activeSessionRef.current = null;
        setNotice('🎉 ¡Sesión completada! Tómate un descanso.');
      }
    };
    timerRef.current = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    tick();
    return () => { clearInterval(timerRef.current); document.removeEventListener('visibilitychange', tick); };
  }, [focusRunning, save]);

  const toggleFocus = () => {
    if (focusRunning) {
      setFocusLeft(secondsRemaining(deadlineRef.current));
      setFocusRunning(false);
    } else {
      const left = focusLeft || focusMins * 60;
      if (!focusLeft) { setFocusLeft(left); setFocusTotal(left); }
      if (!activeSessionRef.current) activeSessionRef.current = {task:focusTask || 'Sesión', mins:focusTotal / 60};
      deadlineRef.current = Date.now() + left * 1000;
      setFocusRunning(true);
    }
  };

  const download = (raw, filename) => {
    const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download=filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  };
  const exportBackup = () => {
    try {
      const raw = loadError ? store.recovery() : JSON.stringify({app:'momentum',version:1,exportedAt:new Date().toISOString(),data:stateRef.current},null,2);
      if (!raw) throw new Error('No hay datos guardados para recuperar.');
      download(raw, 'momentum-'+todayKey()+(loadError?'-recuperacion':'')+'.json');
      setNotice('Respaldo descargado. Guárdalo en un lugar privado.');
      return true;
    } catch (e) { setNotice(e.message); return false; }
  };
  const importBackup = async event => {
    const owner=store.uid;
    const file=event.target.files?.[0]; event.target.value='';
    if (!file) return;
    try {
      if (file.size>MAX_BACKUP_BYTES) throw new Error('El respaldo supera el límite de 5 MB.');
      const next=parseBackup(await file.text());
      if(store.uid!==owner)throw new Error('La cuenta cambió mientras se leía el archivo. Vuelve a seleccionarlo.');
      if (!confirm('Este respaldo contiene '+next.habits.length+' hábitos, '+next.tasks.length+' tareas y '+next.blocks.length+' bloques. Reemplazará la agenda actual. ¿Continuar?')) return;
      if(!store.commit(next,{restore:true}))throw new Error('No se pudo guardar el respaldo en este dispositivo.');
      setFocusRunning(false); activeSessionRef.current=null;
      setNotice('Respaldo restaurado correctamente.');
    } catch (e) { setNotice('No se restauró el archivo: '+e.message); }
  };

  useEffect(() => {
    if (page !== 'schedule' || schedDay !== todayKey() || !timelineRef.current) return;
    timelineRef.current.scrollTop = Math.max(0, nowMins()*1.4-120);
  }, [page, schedDay, loaded]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const handleKey = event => {
      if (event.key === 'Escape') setModal(null);
      if (event.key !== 'Tab') return;
      const controls = [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] input, [role="dialog"] select')].filter(el=>!el.disabled);
      const first=controls[0], last=controls.at(-1);
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown',handleKey);
    return ()=>{document.removeEventListener('keydown',handleKey); previous?.focus();};
  }, [modal]);

  const today = todayKey();
  const quote = QUOTES[new Date().getDay() % QUOTES.length];

  // ── Habit helpers ──
  const toggleHabit = (id, status) => {
    const log = {...state.log, [today]: {...state.log[today]}};
    if (!log[today]) log[today] = {};
    const cur = log[today][id];
    if (cur === status) delete log[today][id]; else log[today][id] = status;
    save({...state, log});
  };
  const addHabit = () => {
    if (!hForm.name.trim()) return;
    save({...state, habits:[...state.habits,{id:uid(),...hForm,createdAt:today}]});
    setHForm({name:"",category:"salud",time:"08:00",why:""}); setModal(null);
  };
  const deleteHabit = id => confirm("¿Eliminar este hábito? Puedes exportar un respaldo antes de borrarlo.") && save({...state, habits:state.habits.filter(h=>h.id!==id)});

  // ── Task helpers ──
  const toggleTask = id => {
    const tasks = state.tasks.map(t => t.id===id ? {...t,done:!t.done,doneAt:!t.done?today:null} : t);
    save({...state, tasks});
  };
  const addTask = () => {
    if (!tForm.name.trim()) return;
    save({...state, tasks:[...state.tasks,{id:uid(),...tForm,done:false,doneAt:null,createdAt:today}]});
    setTForm({name:"",priority:"med",due:"",note:""}); setModal(null);
  };
  const deleteTask = id => confirm("¿Eliminar esta tarea?") && save({...state, tasks:state.tasks.filter(t=>t.id!==id)});

  // ── Block helpers ──
  const addBlock = () => {
    if (!bForm.title.trim() || !bForm.start || !bForm.end) return;

  if (timeToMins(bForm.end) <= timeToMins(bForm.start)) {
    return alert("La hora de fin debe ser mayor a la de inicio.");
  }
  const newBlock = { 
    id:uid(), ...bForm, date:bForm.repeat==="once" ? schedDay:null,
    doneLog:{}, skipLog:{}
  };

  save({...state, blocks:[...state.blocks, newBlock]});

    setBForm({title:"",start:"06:00",end:"06:30",cat:"rutina",repeat:"daily",notes:""}); setModal(null);
  };

  const deleteBlock = id => confirm("¿Eliminar este bloque y sus repeticiones?") && save({...state, blocks:state.blocks.filter(b=>b.id!==id)});
  const toggleBlock = (id, type) => {
    const blocks = state.blocks.map(b => {
      if (b.id !== id) return b;
      const key = schedDay;
      const doneLog = {...b.doneLog};
      const skipLog = {...b.skipLog};
      if (type === "done") {
        if (doneLog[key]) delete doneLog[key]; else { doneLog[key] = true; delete skipLog[key]; }
      } else {
        if (skipLog[key]) delete skipLog[key]; else { skipLog[key] = true; delete doneLog[key]; }
      }
      return {...b, doneLog, skipLog};
    });
    save({...state, blocks});
  };

  // Blocks visible for a given date
  const blocksForDay = dateStr => blocksOnDay(state.blocks, dateStr);

  // ── Progress ──
  const prog = (() => {
    const total = state.habits.length;
    if (!total) return {done:0,total:0,pct:0};
    const done = state.habits.filter(h => state.log[today]?.[h.id]==="done").length;
    return {done, total, pct:Math.round(done/total*100)};
  })();

  const pending = state.tasks.filter(t=>!t.done).sort((a,b)=>({high:0,med:1,low:2}[a.priority]-{high:0,med:1,low:2}[b.priority]));
  const done    = state.tasks.filter(t=>t.done);
  const todaySessions = state.sessions.filter(s=>s.date===today);

  const fmtTime = s => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
  const focusPct = focusLeft / focusTotal;
  const R = 90, CIRC = 2*Math.PI*R;

  if (!loaded) return (
    <div style={{background:"#0f0e0d",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#f59e0b",fontFamily:"monospace",fontSize:13}}>Cargando Momentum…</div>
    </div>
  );

  // ═══════════ STYLES ══════════════════
  const S = {
    app:      {display:"flex",minHeight:"100vh",background:"#0f0e0d",color:"#e8e4df",fontFamily:"'DM Sans',sans-serif"},
    sidebar:  {width:210,background:"#1a1815",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",padding:"24px 0 20px",flexShrink:0,position:"sticky",top:0,height:"100vh"},
    logoH:    {fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:"#f59e0b",margin:0,letterSpacing:"-0.5px"},
    logoSub:  {fontFamily:"'DM Mono',monospace",fontSize:11,color:"#9a9088",marginTop:3,letterSpacing:"0.5px"},
    nav: a => ({display:"flex",alignItems:"center",gap:10,padding:"10px 20px",cursor:"pointer",fontSize:14,color:a?"#f59e0b":"#9a9088",fontWeight:a?500:400,background:a?"rgba(245,158,11,0.12)":"transparent",borderLeft:`2px solid ${a?"#f59e0b":"transparent"}`,transition:"all 0.15s",userSelect:"none"}),
    main:     {flex:1,overflowY:"auto",padding:"32px 36px",maxWidth:900},
    pageH:    {fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:"#e8e4df",margin:"0 0 4px"},
    pageSub:  {fontSize:13,color:"#9a9088",fontWeight:300,margin:0},
    card:     {background:"#1a1815",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:20,marginBottom:16},
    cardTitle:{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#9a9088",textTransform:"uppercase",letterSpacing:"1px",margin:"0 0 14px"},
    statsRow: {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20},
    statCard: {background:"#1a1815",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"14px 12px",textAlign:"center"},
    statVal:  {fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,color:"#f59e0b",lineHeight:1},
    statLbl:  {fontFamily:"'DM Mono',monospace",fontSize:10,color:"#9a9088",marginTop:4},
    row:      {display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"},
    check: s => ({width:26,height:26,borderRadius:"50%",border:`2px solid ${s==="done"?"#10b981":s==="skipped"?"#ef4444":"rgba(255,255,255,0.15)"}`,background:s==="done"?"#10b981":s==="skipped"?"rgba(239,68,68,0.12)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:s==="done"?"#fff":"#ef4444",fontSize:12,transition:"all 0.2s",cursor:"pointer"}),
    btnP:     {padding:"9px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,background:"#f59e0b",color:"#0f0e0d",display:"inline-flex",alignItems:"center",gap:6},
    btnG:     {padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.12)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,background:"transparent",color:"#9a9088",display:"inline-flex",alignItems:"center",gap:6},
    btnD:     {padding:"5px 9px",borderRadius:6,border:"none",cursor:"pointer",background:"rgba(239,68,68,0.12)",color:"#ef4444",fontSize:12},
    input:    {width:"100%",background:"#2e2b28",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"9px 12px",color:"#e8e4df",fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"},
    label:    {display:"block",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#9a9088",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5},
    tag: c => {const m={amber:["rgba(245,158,11,0.15)","#f59e0b"],green:["rgba(16,185,129,0.15)","#10b981"],red:["rgba(239,68,68,0.12)","#ef4444"],blue:["rgba(96,165,250,0.12)","#60a5fa"],purple:["rgba(167,139,250,0.15)","#a78bfa"]}[c]||["rgba(245,158,11,0.15)","#f59e0b"]; return {display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontFamily:"'DM Mono',monospace",fontSize:11,background:m[0],color:m[1]};},
    modal:    {position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)",padding:20},
    modalBox: {background:"#1a1815",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:26,width:"100%",maxWidth:460,boxShadow:"0 24px 64px rgba(0,0,0,0.6)",maxHeight:"90vh",overflowY:"auto"},
    modalH:   {fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,margin:"0 0 18px"},
    progBar:  {height:6,background:"#2e2b28",borderRadius:3,overflow:"hidden",marginTop:8},
    progFill: p => ({height:"100%",background:"linear-gradient(90deg,#f59e0b,#10b981)",borderRadius:3,width:`${p}%`,transition:"width 0.5s ease"}),
    gridDay: (s,it) => ({width:14,height:14,borderRadius:3,background:s==="done"?"#10b981":s==="skipped"?"rgba(239,68,68,0.4)":s==="partial"?"rgba(245,158,11,0.4)":"#2e2b28",outline:it?"2px solid #f59e0b":"none",outlineOffset:1,flexShrink:0}),
    sfooter:  {marginTop:"auto",padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,0.06)",fontFamily:"'DM Mono',monospace",fontSize:10,color:"#a69b90",lineHeight:1.7},
    quote:    {background:"rgba(245,158,11,0.06)",borderLeft:"3px solid #f59e0b",borderRadius:"0 8px 8px 0",padding:"14px 16px",marginBottom:20},
    empty:    {textAlign:"center",padding:"40px 20px",color:"#a69b90"},
    row2:     {display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},
    tabs:     {display:"flex",gap:3,background:"#1a1815",padding:4,borderRadius:8,width:"fit-content"},
    tab: a => ({padding:"6px 14px",borderRadius:6,fontSize:12,cursor:"pointer",color:a?"#e8e4df":"#9a9088",background:a?"#2e2b28":"transparent",fontWeight:a?500:400,userSelect:"none"}),
  };

  // ══════════════════════════════════════
  // PAGE: TODAY
  // ══════════════════════════════════════
  const PageToday = (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={S.pageH}>Buenos días ☀️</h2>
        <p style={S.pageSub}>{new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
      </div>
      <div style={S.quote}>
        <div style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontSize:14,color:"#e8e4df",lineHeight:1.5}}>"{quote.text}"</div>
        <div style={{fontSize:11,color:"#9a9088",marginTop:5,fontFamily:"'DM Mono',monospace"}}>— {quote.author}</div>
      </div>
      <div className="stats-row" style={S.statsRow}>
        {[{v:`${prog.pct}%`,l:"Completado hoy"},{v:`${prog.done}/${prog.total}`,l:"Hábitos"},{v:pending.length,l:"Tareas pendientes"},{v:todaySessions.length,l:"Sesiones enfoque"}].map((s,i)=>(
          <div key={i} style={S.statCard}><div style={S.statVal}>{s.v}</div><div style={S.statLbl}>{s.l}</div></div>
        ))}
      </div>
      <div style={S.card}>
        <p style={S.cardTitle}>Progreso del día</p>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#9a9088",marginBottom:4}}>
          <span>{prog.done} de {prog.total} hábitos completados</span><span>{prog.pct}%</span>
        </div>
        <div style={S.progBar}><div style={S.progFill(prog.pct)}/></div>
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#242220",borderRadius:8,padding:"10px 12px",marginTop:10}}>
          <span style={{color:"#f59e0b",fontSize:13,fontWeight:600}}>+1%</span>
          <div style={{flex:1,height:4,background:"#2e2b28",borderRadius:2}}>
            <div style={{height:"100%",background:"#f59e0b",borderRadius:2,width:`${Math.min(prog.pct,100)}%`,transition:"width 0.5s"}}/>
          </div>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#a69b90"}}>crecimiento diario</span>
        </div>
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <p style={{...S.cardTitle,margin:0}}>Hábitos de hoy</p>
          <button style={{...S.btnP,padding:"6px 12px",fontSize:12}} onClick={()=>setModal("addHabit")}>+ Nuevo</button>
        </div>
        {state.habits.length===0
          ? <div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>🌱</div><p style={{fontSize:13,color:"#9a9088"}}>No tienes hábitos aún.<br/><span style={{color:"#f59e0b",cursor:"pointer"}} onClick={()=>setPage("habits")}>→ Crear primer hábito</span></p></div>
          : state.habits.map(h=>{
            const status=state.log[today]?.[h.id]||null;
            const streak=getStreak(h.id,state.log);
            return (<div key={h.id} style={S.row}>
              <button aria-label={"Completar hábito: "+h.name} aria-pressed={status==="done"} style={S.check(status)} onClick={()=>toggleHabit(h.id,"done")}>{status==="done"?"✓":status==="skipped"?"✕":""}</button>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,color:status==="done"?"#a69b90":"#e8e4df",textDecoration:status==="done"?"line-through":"none"}}>{CAT_ICONS[h.category]} {h.name}</div>
                {h.why&&<div style={{fontSize:11,color:"#a69b90",marginTop:2,fontStyle:"italic"}}>{h.why}</div>}
              </div>
              {streak>0&&<span style={S.tag("amber")}>🔥 {streak}d</span>}
              <button style={{...S.btnD,fontSize:11}} onClick={()=>toggleHabit(h.id,"skipped")}>omitir</button>
            </div>);
          })}
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <p style={{...S.cardTitle,margin:0}}>Tareas prioritarias</p>
          <button style={{...S.btnG,padding:"5px 12px",fontSize:12}} onClick={()=>setPage("tasks")}>Ver todas →</button>
        </div>
        {pending.length===0
          ? <p style={{color:"#a69b90",fontSize:13}}>Sin tareas pendientes. ✨</p>
          : pending.slice(0,5).map(t=>(
            <div key={t.id} style={S.row}>
              <button aria-label={"Completar tarea: "+t.name} aria-pressed={t.done} style={S.check(t.done?"done":null)} onClick={()=>toggleTask(t.id)}>{t.done?"✓":""}</button>
              <div style={{width:8,height:8,borderRadius:"50%",background:PRI_COLORS[t.priority],flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,textDecoration:t.done?"line-through":"none",color:t.done?"#a69b90":"#e8e4df"}}>{t.name}</div>
                {t.due&&<div style={{fontSize:11,color:"#a69b90",fontFamily:"'DM Mono',monospace"}}>📅 {t.due}</div>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // PAGE: SCHEDULE  ← NUEVA
  // ══════════════════════════════════════
  const renderSchedule = () => {
    const dayBlocks = blocksForDay(schedDay);
    const isToday = schedDay === today;

    // Navigation
    const shiftDay = (n) => {
      const d = new Date(schedDay+"T12:00:00");
      d.setDate(d.getDate()+n);
      setSchedDay(todayKey(d));
    };

    // Timeline config
    const HOUR_START = 0;   // Full day, including early morning
    const HOUR_END   = 24;  // midnight
    const HOURS      = Array.from({length:HOUR_END-HOUR_START},(_,i)=>HOUR_START+i);
    const PX_PER_MIN = 1.4; // pixels per minute
    const totalPx    = (HOUR_END-HOUR_START)*60*PX_PER_MIN;
    // Stats for the day
    const total = dayBlocks.length;
    const doneCount = dayBlocks.filter(b=>b.doneLog[schedDay]).length;
    const skipCount = dayBlocks.filter(b=>b.skipLog[schedDay]).length;
    const pending_ = total - doneCount - skipCount;

    return (
      <div>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
          <div>
            <h2 style={S.pageH}>Mi Día</h2>
            <p style={S.pageSub}>Planifica cada hora. Sin tiempo para distracciones.</p>
          </div>
          <button style={S.btnP} onClick={()=>setModal("addBlock")}>✦ Nuevo Bloque</button>
        </div>

        {/* Day navigator */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,background:"#1a1815",borderRadius:10,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.06)"}}>
          <button style={{...S.btnG,padding:"5px 10px",fontSize:13}} aria-label="Día anterior" onClick={()=>shiftDay(-1)}>‹</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:"#e8e4df"}}>
              {isToday ? "Hoy — " : ""}{new Date(schedDay+"T12:00:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}
            </div>
          </div>
          <button style={{...S.btnG,padding:"5px 10px",fontSize:13}} aria-label="Día siguiente" onClick={()=>shiftDay(1)}>›</button>
          {!isToday && <button style={{...S.btnG,padding:"5px 10px",fontSize:11}} onClick={()=>setSchedDay(today)}>Hoy</button>}
        </div>

        {/* Day stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {[{v:doneCount,l:"Completados",c:"#10b981"},{v:pending_,l:"Pendientes",c:"#f59e0b"},{v:skipCount,l:"Omitidos",c:"#ef4444"}].map((s,i)=>(
            <div key={i} style={{...S.statCard,borderTop:`3px solid ${s.c}`}}>
              <div style={{...S.statVal,color:s.c,fontSize:22}}>{s.v}</div>
              <div style={S.statLbl}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        {dayBlocks.length===0 && (
          <div style={{...S.card,...S.empty}}>
            <div style={{fontSize:38,marginBottom:12}}>🗓️</div>
            <p style={{fontSize:14,color:"#9a9088",lineHeight:1.7}}>
              No tienes bloques en tu agenda aún.<br/>
              Crea bloques de tiempo para estructurar tu día<br/>
              y no desperdiciar ni un minuto.
            </p>
            <button style={{...S.btnP,marginTop:16}} onClick={()=>setModal("addBlock")}>✦ Crear primer bloque</button>
          </div>
        )}

        {dayBlocks.length>0 && (
          <div style={{...S.card,padding:0,overflow:"hidden"}}>
            {/* Legend */}
            <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:16,flexWrap:"wrap"}}>
              {BLOCK_CATS.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#9a9088"}}>
                  <div style={{width:10,height:10,borderRadius:2,background:c.color,opacity:0.8}}/>{c.label}
                </div>
              ))}
            </div>

            <div ref={timelineRef} style={{position:"relative",height:"560px",overflowY:"auto"}}>
              <div style={{position:"relative",height:totalPx+"px",display:"flex"}}>

                {/* Hour labels column */}
                <div style={{width:56,flexShrink:0,position:"sticky",left:0,zIndex:5}}>
                  {HOURS.map(h=>(
                    <div key={h} style={{position:"absolute",top:(h-HOUR_START)*60*PX_PER_MIN-9,left:0,width:52,textAlign:"right",paddingRight:8,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#a69b90",lineHeight:1}}>
                      {String(h%24).padStart(2,"0")}:00
                    </div>
                  ))}
                </div>

                {/* Grid lines + blocks area */}
                <div style={{flex:1,position:"relative",borderLeft:"1px solid rgba(255,255,255,0.05)"}}>
                  {/* Hour grid lines */}
                  {HOURS.map(h=>(
                    <div key={h} style={{position:"absolute",top:(h-HOUR_START)*60*PX_PER_MIN,left:0,right:0,borderTop:"1px solid rgba(255,255,255,0.04)"}}/>
                  ))}
                  {/* 30-min lines */}
                  {HOURS.map(h=>(
                    <div key={h+".5"} style={{position:"absolute",top:(h-HOUR_START)*60*PX_PER_MIN+30*PX_PER_MIN,left:0,right:0,borderTop:"1px dashed rgba(255,255,255,0.025)"}}/>
                  ))}

                  {/* Current time indicator */}
                  {isToday && currentTime >= HOUR_START*60 && currentTime < HOUR_END*60 && (
                    <div style={{position:"absolute",top:(currentTime-HOUR_START*60)*PX_PER_MIN,left:0,right:0,zIndex:10,pointerEvents:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:0}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#ef4444",marginLeft:-5,flexShrink:0}}/>
                        <div style={{flex:1,height:2,background:"#ef4444",opacity:0.9}}/>
                      </div>
                      <div style={{position:"absolute",left:8,top:-16,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#ef4444",background:"rgba(239,68,68,0.15)",padding:"1px 6px",borderRadius:4}}>
                        {minsToTime(currentTime)}
                      </div>
                    </div>
                  )}

                  {/* Blocks */}
                  {dayBlocks.map((b, bi)=>{
                    const startM = timeToMins(b.start);
                    const endM   = timeToMins(b.end);
                    if (startM < HOUR_START*60 || startM >= HOUR_END*60) return null;
                    const top    = (startM - HOUR_START*60)*PX_PER_MIN;
                    const height = Math.max(24, (endM - startM)*PX_PER_MIN);
                    const cat    = catById(b.cat);
                    const isDone = !!b.doneLog[schedDay];
                    const isSkip = !!b.skipLog[schedDay];
                    const dur    = endM - startM;
                    const isTall = height > 40;
                    const isPast = isToday && endM < currentTime;
                    const isCurrent = isToday && startM <= currentTime && endM > currentTime;

                    return (
                      <div key={b.id} style={{
                        position:"absolute", top, left:4, right:4, height,
                        background: isDone ? "rgba(16,185,129,0.18)"
                                  : isSkip ? "rgba(239,68,68,0.1)"
                                  : `${cat.color}18`,
                        border:`1.5px solid ${isDone?"#10b981":isSkip?"rgba(239,68,68,0.3)":cat.color}${isDone||isSkip?"":"55"}`,
                        borderLeft:`3px solid ${isDone?"#10b981":isSkip?"#ef4444":cat.color}`,
                        borderRadius:6, padding:"4px 8px", overflow:"hidden",
                        boxSizing:"border-box", zIndex:3,
                        opacity: isSkip ? 0.5 : (isPast && !isDone) ? 0.55 : 1,
                        boxShadow: isCurrent ? `0 0 0 2px ${cat.color}55,0 4px 16px ${cat.color}22` : "none",
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:6,height:"100%"}}>
                          {isTall && <span style={{fontSize:14,flexShrink:0}}>{isDone?"✅":isSkip?"⏭":cat.icon}</span>}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:isDone?"#10b981":isSkip?"#9a9088":"#e8e4df",textDecoration:isSkip?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {b.title}
                            </div>
                            {isTall&&<div style={{fontSize:10,color:"#a69b90",fontFamily:"'DM Mono',monospace",marginTop:2}}>
                              {fmtDisplay(b.start)} – {fmtDisplay(b.end)} · {dur}min
                            </div>}
                          </div>
                          {/* Action buttons - only show on hover via CSS, workaround with always-visible mini buttons */}
                          <div style={{display:"flex",gap:3,flexShrink:0}}>
                            <button
                              style={{width:20,height:20,borderRadius:4,border:"none",cursor:"pointer",background:isDone?"rgba(16,185,129,0.3)":"rgba(16,185,129,0.15)",color:"#10b981",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                              onClick={e=>{e.stopPropagation();toggleBlock(b.id,"done")}}
                              title="Marcar como hecho"
                            >✓</button>
                            <button
                              style={{width:20,height:20,borderRadius:4,border:"none",cursor:"pointer",background:isSkip?"rgba(239,68,68,0.3)":"rgba(239,68,68,0.12)",color:"#ef4444",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                              onClick={e=>{e.stopPropagation();toggleBlock(b.id,"skip")}}
                              title="Omitir"
                            >✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Block list (compact) */}
        {dayBlocks.length>0&&(
          <div style={S.card}>
            <p style={S.cardTitle}>Lista de bloques</p>
            {dayBlocks.map(b=>{
              const cat=catById(b.cat);
              const isDone=!!b.doneLog[schedDay];
              const isSkip=!!b.skipLog[schedDay];
              const dur=timeToMins(b.end)-timeToMins(b.start);
              return (
                <div key={b.id} style={{...S.row,borderColor:"rgba(255,255,255,0.04)"}}>
                  <div style={{width:4,alignSelf:"stretch",borderRadius:2,background:cat.color,flexShrink:0,marginRight:4}}/>
                  <span style={{fontSize:18,flexShrink:0}}>{isDone?"✅":isSkip?"⏭":cat.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,color:isDone?"#4a4540":isSkip?"#a69b90":"#e8e4df",textDecoration:isSkip?"line-through":"none"}}>{b.title}</div>
                    <div style={{fontSize:11,color:"#a69b90",fontFamily:"'DM Mono',monospace"}}>
                      {fmtDisplay(b.start)} – {fmtDisplay(b.end)} · {dur} min
                      {b.repeat!=="once"&&<span style={{marginLeft:8,color:"#6a6560"}}>{b.repeat==="daily"?"· Todos los días":b.repeat==="weekdays"?"· L–V":b.repeat==="weekends"?"· Fines de semana":""}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{...S.btnG,padding:"4px 10px",fontSize:11,color:isDone?"#10b981":"#9a9088",borderColor:isDone?"rgba(16,185,129,0.3)":"rgba(255,255,255,0.1)"}} onClick={()=>toggleBlock(b.id,"done")}>{isDone?"✓ Hecho":"✓"}</button>
                    <button style={S.btnD} onClick={()=>deleteBlock(b.id)} title="Eliminar bloque">🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════
  // PAGE: HABITS
  // ══════════════════════════════════════
  const PageHabits = (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24}}>
        <div><h2 style={S.pageH}>Mis Hábitos</h2><p style={S.pageSub}>Construye rutinas que te transformen 1% cada día</p></div>
        <button style={S.btnP} onClick={()=>setModal("addHabit")}>✦ Nuevo Hábito</button>
      </div>
      {state.habits.length===0
        ? <div style={{...S.card,...S.empty}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><p style={{color:"#9a9088",fontSize:14,lineHeight:1.6}}>Los hábitos atómicos son pequeñas acciones<br/>que, repetidas cada día, generan grandes cambios.</p><button style={{...S.btnP,marginTop:16}} onClick={()=>setModal("addHabit")}>✦ Crear mi primer hábito</button></div>
        : state.habits.map(h=>{
          const streak=getStreak(h.id,state.log);
          const week=getWeek7();
          const done30=getLast30().filter(d=>state.log[d]?.[h.id]==="done").length;
          return (
            <div key={h.id} style={S.card}>
              <div style={{display:"flex",gap:14}}>
                <span style={{fontSize:28}}>{CAT_ICONS[h.category]}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontSize:16,fontWeight:600}}>{h.name}</span>
                    {streak>0&&<span style={S.tag("amber")}>🔥 {streak} días</span>}
                    <span style={S.tag("blue")}>{done30}/30 días</span>
                  </div>
                  {h.why&&<div style={{fontSize:12,color:"#9a9088",fontStyle:"italic",marginBottom:6}}>"{h.why}"</div>}
                  <div style={{fontSize:11,color:"#a69b90",fontFamily:"'DM Mono',monospace",marginBottom:10}}>{h.time?`⏰ ${h.time}  `:""}Creado: {h.createdAt}</div>
                  <div style={{fontSize:10,color:"#a69b90",fontFamily:"'DM Mono',monospace",marginBottom:6}}>ÚLTIMOS 7 DÍAS</div>
                  <div style={{display:"flex",gap:4}}>
                    {week.map(d=>{const s=state.log[d]?.[h.id]; return <div key={d} style={S.gridDay(s,d===today)} title={d}/>;})}
                  </div>
                </div>
                <button style={S.btnD} onClick={()=>deleteHabit(h.id)}>🗑</button>
              </div>
            </div>
          );
        })}
    </div>
  );

  // ══════════════════════════════════════
  // PAGE: TASKS
  // ══════════════════════════════════════
  const PageTasks = (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div><h2 style={S.pageH}>Tareas</h2><p style={S.pageSub}>{pending.length} pendientes · {done.length} completadas</p></div>
        <button style={S.btnP} onClick={()=>setModal("addTask")}>✦ Nueva Tarea</button>
      </div>
      <div style={{...S.tabs,marginBottom:16}}>
        {[["pending",`Pendientes (${pending.length})`],["done",`Completadas (${done.length})`]].map(([k,l])=>(
          <div key={k} style={S.tab(taskTab===k)} onClick={()=>setTaskTab(k)}>{l}</div>
        ))}
      </div>
      <div style={S.card}>
        {(taskTab==="pending"?pending:done).length===0
          ? <div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>{taskTab==="pending"?"✅":"📭"}</div><p style={{fontSize:13,color:"#9a9088"}}>{taskTab==="pending"?"No hay tareas pendientes. ¡Genial!":"No hay tareas completadas aún."}</p></div>
          : (taskTab==="pending"?pending:done).map(t=>(
            <div key={t.id} style={S.row}>
              <button aria-label={"Completar tarea: "+t.name} aria-pressed={t.done} style={S.check(t.done?"done":null)} onClick={()=>toggleTask(t.id)}>{t.done?"✓":""}</button>
              <div style={{width:8,height:8,borderRadius:"50%",background:PRI_COLORS[t.priority],flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,textDecoration:t.done?"line-through":"none",color:t.done?"#a69b90":"#e8e4df"}}>{t.name}</div>
                <div style={{fontSize:11,color:"#a69b90",fontFamily:"'DM Mono',monospace"}}>{PRI_LABELS[t.priority]}{t.due?` · 📅 ${t.due}`:""}{t.note?` · ${t.note}`:""}</div>
              </div>
              <button style={S.btnD} onClick={()=>deleteTask(t.id)}>🗑</button>
            </div>
          ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // PAGE: FOCUS
  // ══════════════════════════════════════
  const PageFocus = (
    <div>
      <div style={{marginBottom:24}}><h2 style={S.pageH}>Modo Enfoque</h2><p style={S.pageSub}>Elimina distracciones. Un paso a la vez.</p></div>
      <div style={S.card}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"36px 20px"}}>
          <div style={{position:"relative",width:200,height:200,marginBottom:24}}>
            <svg width="200" height="200" viewBox="0 0 200 200" style={{transform:"rotate(-90deg)"}}>
              <circle cx="100" cy="100" r={R} fill="none" stroke="#2e2b28" strokeWidth="6"/>
              <circle cx="100" cy="100" r={R} fill="none" stroke="#f59e0b" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC-CIRC*focusPct}
                style={{transition:focusRunning?"stroke-dashoffset 1s linear":"none"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontFamily:"'Playfair Display',serif",fontSize:40,fontWeight:900,color:"#f59e0b",letterSpacing:-1}}>{fmtTime(focusLeft)}</span>
            </div>
          </div>
          <div style={{fontSize:15,color:"#9a9088",fontStyle:"italic",marginBottom:24}}>{focusTask||"Selecciona una tarea para comenzar"}</div>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {[10,25,50].map(m=>(
              <button key={m} style={{...S.btnG,padding:"6px 16px",fontSize:12,background:focusMins===m?"rgba(245,158,11,0.12)":"transparent",color:focusMins===m?"#f59e0b":"#9a9088"}}
                disabled={focusRunning} onClick={()=>{activeSessionRef.current=null;setFocusMins(m);setFocusLeft(m*60);setFocusTotal(m*60);}}>
                {m} min
              </button>
            ))}
          </div>
          <div style={{width:"100%",maxWidth:280,marginBottom:20}}>
            <select style={{...S.input,cursor:"pointer"}} disabled={focusRunning || activeSessionRef.current!==null} value={focusTask} onChange={e=>setFocusTask(e.target.value)}>
              <option value="">— Seleccionar tarea —</option>
              {pending.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={S.btnP} onClick={toggleFocus}>
              {focusRunning?"⏸ Pausar":"▶ Iniciar"}
            </button>
            <button style={S.btnG} onClick={()=>{activeSessionRef.current=null;setFocusRunning(false);setFocusLeft(focusMins*60);setFocusTotal(focusMins*60);}}>↺ Reiniciar</button>
          </div>
        </div>
      </div>
      <div style={S.card}>
        <p style={S.cardTitle}>Sesiones completadas hoy</p>
        {todaySessions.length===0
          ? <p style={{color:"#a69b90",fontSize:13}}>Sin sesiones hoy aún. ¡Comienza una! 🎯</p>
          : todaySessions.map((s,i)=>(
            <div key={i} style={S.row}><span style={{fontSize:20}}>🎯</span>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>{s.task}</div><div style={{fontSize:11,color:"#a69b90",fontFamily:"'DM Mono',monospace"}}>{s.mins} minutos</div></div>
              <span style={S.tag("green")}>✓ Completada</span>
            </div>
          ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // PAGE: HISTORY
  // ══════════════════════════════════════
  const renderHistory = () => {
    const last30=getLast30();
    const totalDays=last30.filter(d=>{const l=state.log[d]||{};return Object.values(l).some(v=>v==="done");}).length;
    const totalDone=Object.values(state.log).reduce((acc,l)=>acc+Object.values(l).filter(v=>v==="done").length,0);
    // Schedule completion
    const schedCompleted=last30.reduce((acc,d)=>{
      const db=blocksForDay(d);
      return acc+db.filter(b=>b.doneLog[d]).length;
    },0);
    return (
      <div>
        <div style={{marginBottom:24}}><h2 style={S.pageH}>Historial</h2><p style={S.pageSub}>Visualiza tu progreso acumulado</p></div>
        <div className="stats-row" style={S.statsRow}>
          {[{v:totalDays,l:"Días activos (30d)"},{v:totalDone,l:"Total hábitos"},{v:state.sessions.length,l:"Sesiones enfoque"},{v:schedCompleted,l:"Bloques completados"}].map((s,i)=>(
            <div key={i} style={S.statCard}><div style={S.statVal}>{s.v}</div><div style={S.statLbl}>{s.l}</div></div>
          ))}
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Consistencia de hábitos — últimos 30 días</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {last30.map(d=>{
              const l=state.log[d]||{};
              const total=state.habits.length;
              if(!total) return <div key={d} style={S.gridDay(null,d===today)} title={d}/>;
              const dc=Object.values(l).filter(v=>v==="done").length;
              const pct=dc/total;
              const s=pct>=0.8?"done":pct>=0.3?"partial":null;
              return <div key={d} style={{...S.gridDay(s,d===today),width:18,height:18,borderRadius:4}} title={`${d}: ${dc}/${total}`}/>;
            })}
          </div>
          <div style={{display:"flex",gap:16,marginTop:10}}>
            {[["#10b981","≥80%"],["rgba(245,158,11,0.4)","Parcial"],["#2e2b28","Sin registrar"]].map(([color,label])=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#a69b90",fontFamily:"'DM Mono',monospace"}}>
                <div style={{width:10,height:10,borderRadius:2,background:color}}/>{label}
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <p style={S.cardTitle}>Por hábito — últimos 30 días</p>
          {state.habits.length===0
            ? <p style={{color:"#a69b90",fontSize:13}}>Crea hábitos para ver tu historial.</p>
            : state.habits.map(h=>{
              const done30=getLast30().filter(d=>state.log[d]?.[h.id]==="done").length;
              const streak=getStreak(h.id,state.log);
              return (
                <div key={h.id} style={{marginBottom:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,flexWrap:"wrap"}}>
                    <span>{CAT_ICONS[h.category]}</span>
                    <span style={{fontSize:13,fontWeight:500}}>{h.name}</span>
                    <span style={S.tag("amber")}>{done30}/30 días</span>
                    {streak>0&&<span style={S.tag("green")}>🔥 {streak}</span>}
                  </div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {getLast30().map(d=>{const s=state.log[d]?.[h.id]; return <div key={d} style={S.gridDay(s,d===today)} title={d}/>;})}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  const pages={today:PageToday,habits:PageHabits,tasks:PageTasks,focus:PageFocus};

  // ══════════════════════════════════════
  // MODAL: ADD BLOCK
  // ══════════════════════════════════════
  const ModalAddBlock = (
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
      <div role="dialog" aria-modal="true" aria-label="Agregar elemento" style={S.modalBox}>
        <h3 style={S.modalH}>Nuevo Bloque de Tiempo</h3>

        <div style={{marginBottom:12}}>
          <label htmlFor="field-1" style={S.label}>Actividad</label>
          <input id="field-1" maxLength={2000} style={S.input} placeholder="Ej: Levantar pesas, Leer, Desayunar..." value={bForm.title}
            onChange={e=>setBForm({...bForm,title:e.target.value})} autoFocus
            onKeyDown={e=>e.key==="Enter"&&addBlock()} />
        </div>

        <div className="two-col" style={S.row2}>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-2" style={S.label}>Hora de inicio</label>
            <input id="field-2" style={S.input} type="time" value={bForm.start} onChange={e=>setBForm({...bForm,start:e.target.value})}/>
          </div>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-3" style={S.label}>Hora de fin</label>
            <input id="field-3" style={S.input} type="time" value={bForm.end} onChange={e=>setBForm({...bForm,end:e.target.value})}/>
          </div>
        </div>

        {/* Duration preview */}
        {bForm.start && bForm.end && timeToMins(bForm.end) > timeToMins(bForm.start) && (
          <div style={{background:"rgba(245,158,11,0.08)",borderRadius:8,padding:"8px 12px",marginBottom:12,fontFamily:"'DM Mono',monospace",fontSize:12,color:"#f59e0b"}}>
            ⏱ Duración: {timeToMins(bForm.end)-timeToMins(bForm.start)} minutos
          </div>
        )}

        <div className="two-col" style={S.row2}>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-4" style={S.label}>Categoría</label>
            <select id="field-4" style={{...S.input,cursor:"pointer"}} value={bForm.cat} onChange={e=>setBForm({...bForm,cat:e.target.value})}>
              {BLOCK_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-5" style={S.label}>Repetición</label>
            <select id="field-5" style={{...S.input,cursor:"pointer"}} value={bForm.repeat} onChange={e=>setBForm({...bForm,repeat:e.target.value})}>
              <option value="daily">📅 Todos los días</option>
              <option value="weekdays">💼 Lunes a viernes</option>
              <option value="weekends">🌅 Fines de semana</option>
              <option value="once">1️⃣ Solo la fecha seleccionada</option>
            </select>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label htmlFor="field-6" style={S.label}>Nota (opcional)</label>
          <input id="field-6" maxLength={2000} style={S.input} placeholder="Detalles adicionales..." value={bForm.notes} onChange={e=>setBForm({...bForm,notes:e.target.value})}/>
        </div>

        {/* Color preview */}
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#242220",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
          <div style={{width:12,height:36,borderRadius:3,background:catById(bForm.cat).color,flexShrink:0}}/>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:"#e8e4df"}}>{bForm.title||"Vista previa"}</div>
            <div style={{fontSize:11,color:"#9a9088",fontFamily:"'DM Mono',monospace"}}>
              {bForm.start?fmtDisplay(bForm.start):""} {bForm.end?"– "+fmtDisplay(bForm.end):""} · {catById(bForm.cat).icon} {catById(bForm.cat).label}
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={S.btnG} onClick={()=>setModal(null)}>Cancelar</button>
          <button style={S.btnP} onClick={addBlock}>✦ Agregar Bloque</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // MODAL: ADD HABIT
  // ══════════════════════════════════════
  const ModalAddHabit = (
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
      <div role="dialog" aria-modal="true" aria-label="Agregar elemento" style={S.modalBox}>
        <h3 style={S.modalH}>Nuevo Hábito</h3>
        <div style={{marginBottom:12}}>
          <label htmlFor="field-7" style={S.label}>Nombre del hábito</label>
          <input id="field-7" maxLength={2000} style={S.input} placeholder="Ej: Meditar 10 minutos" value={hForm.name} onChange={e=>setHForm({...hForm,name:e.target.value})} autoFocus onKeyDown={e=>e.key==="Enter"&&addHabit()}/>
        </div>
        <div className="two-col" style={S.row2}>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-8" style={S.label}>Categoría</label>
            <select id="field-8" style={{...S.input,cursor:"pointer"}} value={hForm.category} onChange={e=>setHForm({...hForm,category:e.target.value})}>
              {Object.entries(CAT_ICONS).map(([k,v])=><option key={k} value={k}>{v} {k.charAt(0).toUpperCase()+k.slice(1)}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-9" style={S.label}>Hora sugerida</label>
            <input id="field-9" style={S.input} type="time" value={hForm.time} onChange={e=>setHForm({...hForm,time:e.target.value})}/>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label htmlFor="field-10" style={S.label}>¿Por qué quieres este hábito?</label>
          <input id="field-10" maxLength={2000} style={S.input} placeholder="Tu motivación personal..." value={hForm.why} onChange={e=>setHForm({...hForm,why:e.target.value})}/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={S.btnG} onClick={()=>setModal(null)}>Cancelar</button>
          <button style={S.btnP} onClick={addHabit}>✦ Crear Hábito</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // MODAL: ADD TASK
  // ══════════════════════════════════════
  const ModalAddTask = (
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
      <div role="dialog" aria-modal="true" aria-label="Agregar elemento" style={S.modalBox}>
        <h3 style={S.modalH}>Nueva Tarea</h3>
        <div style={{marginBottom:12}}>
          <label htmlFor="field-11" style={S.label}>¿Qué debes hacer?</label>
          <input id="field-11" maxLength={2000} style={S.input} placeholder="Describe tu tarea..." value={tForm.name} onChange={e=>setTForm({...tForm,name:e.target.value})} autoFocus onKeyDown={e=>e.key==="Enter"&&addTask()}/>
        </div>
        <div className="two-col" style={S.row2}>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-12" style={S.label}>Prioridad</label>
            <select id="field-12" style={{...S.input,cursor:"pointer"}} value={tForm.priority} onChange={e=>setTForm({...tForm,priority:e.target.value})}>
              <option value="high">🔴 Alta</option>
              <option value="med">🟡 Media</option>
              <option value="low">🟢 Baja</option>
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label htmlFor="field-13" style={S.label}>Fecha límite</label>
            <input id="field-13" style={S.input} type="date" value={tForm.due} onChange={e=>setTForm({...tForm,due:e.target.value})}/>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label htmlFor="field-14" style={S.label}>Nota opcional</label>
          <input id="field-14" maxLength={2000} style={S.input} placeholder="Contexto adicional..." value={tForm.note} onChange={e=>setTForm({...tForm,note:e.target.value})}/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={S.btnG} onClick={()=>setModal(null)}>Cancelar</button>
          <button style={S.btnP} onClick={addTask}>✦ Agregar Tarea</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <div className="app" style={S.app}>
      {/* Sidebar */}
      <nav aria-label="Navegación principal" className="sidebar" style={S.sidebar}>
        <div style={{padding:"0 20px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",marginBottom:16}}>
          <h1 style={S.logoH}>Momentum</h1>
          <p style={S.logoSub}>+1% cada día</p>
        </div>
        {[
          ["today",   "☀️", "Hoy"],
          ["schedule","🗓️", "Mi Día"],
          ["habits",  "🔄", "Hábitos"],
          ["tasks",   "✅", "Tareas"],
          ["focus",   "🎯", "Enfoque"],
          ["history", "📊", "Historial"],
        ].map(([k,icon,label])=>(
          <button type="button" aria-current={page===k?"page":undefined} key={k} style={S.nav(page===k)} onClick={()=>setPage(k)}>
            <span style={{fontSize:16,width:20,textAlign:"center"}}>{icon}</span>{label}
          </button>
        ))}
        <div style={S.sfooter}>
          {new Date().toLocaleDateString("es-ES",{weekday:"long"})}<br/>
          {new Date().toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"})}<br/>
          <span style={{color:"#ef4444"}}>● </span>
          {minsToTime(currentTime)}
        </div>
      </nav>

      {/* Main */}
      <main className="main" style={S.main}>
        <CloudPanel store={store} view={view} user={user} authReady={authReady} exportBackup={exportBackup}/>
        <div className="backup-bar">
          <span>{user ? "Copia local y sincronización privada" : "Guardado solo en este dispositivo"}</span>
          <button onClick={exportBackup}>Exportar respaldo</button>
          <button onClick={()=>importRef.current.click()}>Restaurar respaldo</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importBackup}/>
        </div>
        <p className="storage-help">{user ? "Los cambios pendientes necesitan conexión para llegar a la nube. Conserva también un respaldo periódico." : "Haz un respaldo semanal. Borrar los datos del navegador o cambiar de dirección web puede dejarte sin acceso a esta agenda."}</p>
        {storageError && <div className="notice error" role="alert">{storageError}</div>}
        {notice && <div className="notice" role="status">{notice} <button aria-label="Cerrar aviso" onClick={()=>setNotice('')}>×</button></div>}
        {page==="schedule" ? renderSchedule() : page==="history" ? renderHistory() : pages[page]}
      </main>

      {/* Modals */}
      {modal==="addBlock" && ModalAddBlock}
      {modal==="addHabit" && ModalAddHabit}
      {modal==="addTask"  && ModalAddTask}
    </div>
  );
}
