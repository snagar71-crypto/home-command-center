import { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase.js";

const CALENDAR_EMAIL = "sanmeenal.nagar@gmail.com";
const EVENTS_COL = "events";

// Neuqua Girls Tennis iCal feed (via CORS proxy)
const TENNIS_ICAL_URL = "https://corsproxy.io/?url=https://calendar.google.com/calendar/ical/c_classroom0c997a2f%40group.calendar.google.com/public/basic.ics";

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "#E05C3A", bg: "#FEF0EC", dot: "🔴" },
  medium: { label: "Medium", color: "#D4911A", bg: "#FEF9EC", dot: "🟡" },
  low:    { label: "Low",    color: "#2E8B57", bg: "#EDF7F1", dot: "🟢" },
};

const CATEGORY_CONFIG = {
  school:  { label: "School",  icon: "📚", color: "#5B6EB5" },
  tennis:  { label: "Tennis",  icon: "🎾", color: "#2E8B57" },
  family:  { label: "Family",  icon: "🏠", color: "#D4911A" },
  health:  { label: "Health",  icon: "🩺", color: "#C0516A" },
  social:  { label: "Social",  icon: "🎉", color: "#7B5EA7" },
  other:   { label: "Other",   icon: "📌", color: "#607D8B" },
};

const KIDS = ["Meenal", "Nagar", "Both"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── helpers ───────────────────────────────────────────────────────────────────

function getToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function toDateObj(str) {
  const [y,m,d] = str.split("-").map(Number);
  return new Date(y, m-1, d);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getWeekStart(date) {
  const d = new Date(date); d.setDate(d.getDate() - d.getDay()); return d;
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-");
  return new Date(y,m-1,d).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
}
function formatTodayLabel() {
  return new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
}
function daysUntil(dateStr) {
  const diff = Math.round((toDateObj(dateStr) - getToday()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `In ${diff}d`;
}
function buildGCalURL(event) {
  const ds = event.date.replace(/-/g,"");
  const ts = event.time ? event.time.replace(":","")+"00" : "000000";
  const eh = event.time ? String(parseInt(event.time.split(":")[0])+1).padStart(2,"0") : "01";
  const em = event.time ? event.time.split(":")[1] : "00";
  const title = encodeURIComponent(`${CATEGORY_CONFIG[event.category]?.icon||""} ${event.title} (${event.kid})`);
  const details = encodeURIComponent(`[${event.kid}] ${event.notes||""}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${ds}T${ts}/${ds}T${eh}${em}00&details=${details}&sf=true&output=xml`;
}

// ── iCal parser ───────────────────────────────────────────────────────────────

function parseICal(text) {
  const events = [];
  const lines = text.replace(/\r\n /g, "").replace(/\r\n\t/g, "").split(/\r\n|\n|\r/);
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT" && current) {
      if (current.date && current.title) events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith("SUMMARY:")) {
        current.title = line.replace("SUMMARY:", "").trim();
      } else if (line.startsWith("DTSTART")) {
        const val = line.split(":")[1]?.trim();
        if (val) {
          // Handle both date-only (YYYYMMDD) and datetime (YYYYMMDDTHHmmssZ)
          const y = val.substring(0,4);
          const m = val.substring(4,6);
          const d = val.substring(6,8);
          current.date = `${y}-${m}-${d}`;
          if (val.includes("T")) {
            const h = val.substring(9,11);
            const min = val.substring(11,13);
            // Convert UTC to local — simple offset approach
            const dt = new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
            current.time = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
          }
        }
      } else if (line.startsWith("LOCATION:")) {
        current.notes = line.replace("LOCATION:", "").trim();
      } else if (line.startsWith("DESCRIPTION:")) {
        current.description = line.replace("DESCRIPTION:", "").trim();
      }
    }
  }
  return events;
}

// ── shared styles ─────────────────────────────────────────────────────────────

const iconBtn = (bg, color) => ({
  background: bg, color, border: "none", borderRadius: 7,
  padding: "5px 9px", cursor: "pointer", fontSize: 13,
});
const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E0E0E8",
  fontSize: 14, marginBottom: 14, boxSizing: "border-box", fontFamily: "inherit",
  outline: "none", color: "#1A1A2E",
};
const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#888",
  textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5,
};
const sectionStyle = {
  background: "#fff", border: "1px solid #E8E8EC",
  borderRadius: 12, padding: "16px 18px", marginBottom: 16,
};
const sectionHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  fontWeight: 800, fontSize: 14, color: "#1A1A2E",
  marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #F0F0F5",
};

// ── TennisEventCard ───────────────────────────────────────────────────────────

function TennisEventCard({ event, compact }) {
  const cat = CATEGORY_CONFIG.tennis;
  return (
    <div style={{
      background:"#F0FBF4", border:"1px solid #C8EDD8",
      borderLeft:`4px solid ${cat.color}`, borderRadius:10,
      padding: compact ? "10px 14px" : "14px 18px",
      marginBottom:10,
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700,color:"#1A1A2E"}}>{event.title}</span>
            <span style={{background:"#2E8B57",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,textTransform:"uppercase",letterSpacing:"0.5px"}}>
              🎾 Neuqua Tennis
            </span>
          </div>
          <div style={{display:"flex",gap:12,marginTop:5,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#666"}}>🎾 Tennis</span>
            <span style={{fontSize:12,color:"#666"}}>👤 Both</span>
            <span style={{fontSize:12,color:"#444",fontWeight:600}}>
              📅 {formatDate(event.date)}{event.time ? ` · ${event.time}` : ""}
            </span>
            <span style={{fontSize:11,fontWeight:700,color:daysUntil(event.date)==="Today"?"#E05C3A":"#2E8B57"}}>
              {daysUntil(event.date)}
            </span>
          </div>
          {event.notes && !compact && (
            <div style={{fontSize:12,color:"#666",marginTop:5}}>📍 {event.notes}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ event, onEdit, onDelete, compact }) {
  // Tennis events from iCal are read-only
  if (event.source === "ical") return <TennisEventCard event={event} compact={compact} />;

  const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.other;
  const pri = PRIORITY_CONFIG[event.priority] || PRIORITY_CONFIG.medium;
  return (
    <div style={{background:"#fff",border:"1px solid #E8E8EC",borderLeft:`4px solid ${cat.color}`,borderRadius:10,padding:compact?"10px 14px":"14px 18px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700,color:"#1A1A2E"}}>{event.title}</span>
            <span style={{background:pri.bg,color:pri.color,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,textTransform:"uppercase",letterSpacing:"0.5px"}}>{pri.dot} {pri.label}</span>
          </div>
          <div style={{display:"flex",gap:12,marginTop:5,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#666"}}>{cat.icon} {cat.label}</span>
            <span style={{fontSize:12,color:"#666"}}>👤 {event.kid}</span>
            <span style={{fontSize:12,color:"#444",fontWeight:600}}>📅 {formatDate(event.date)}{event.time?` · ${event.time}`:""}</span>
            <span style={{fontSize:11,fontWeight:700,color:daysUntil(event.date)==="Today"?"#E05C3A":"#5B6EB5"}}>{daysUntil(event.date)}</span>
          </div>
          {event.notes&&!compact&&<div style={{fontSize:12,color:"#888",marginTop:5,fontStyle:"italic"}}>{event.notes}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <a href={buildGCalURL(event)} target="_blank" rel="noopener noreferrer" style={{background:"#4285F4",color:"#fff",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>📅 GCal</a>
          <button onClick={()=>onEdit(event)} style={iconBtn("#F0F0F8","#5B6EB5")}>✏️</button>
          <button onClick={()=>onDelete(event.id)} style={iconBtn("#FEF0EC","#E05C3A")}>🗑️</button>
        </div>
      </div>
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────

function WeekView({ events, onEdit, onDelete, onAddOnDay }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = getToday();
  const todayStr = toDateStr(today);
  const weekStart = useMemo(()=>addDays(getWeekStart(today),weekOffset*7),[weekOffset]);
  const weekDays = useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);
  const weekLabel = (()=>{
    const s=weekDays[0],e=weekDays[6];
    if(s.getMonth()===e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();
  const eventsOnDay = (ds)=>events.filter(e=>e.date===ds).sort((a,b)=>(a.time||"").localeCompare(b.time||""));

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,background:"#fff",borderRadius:12,padding:"12px 16px",border:"1px solid #E8E8EC"}}>
        <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:"#F0F0F8",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,color:"#5B6EB5",fontSize:16}}>‹</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:15,color:"#1A1A2E"}}>{weekLabel}</div>
          {weekOffset===0&&<div style={{fontSize:11,color:"#E05C3A",fontWeight:700,marginTop:2}}>This Week</div>}
          {weekOffset===1&&<div style={{fontSize:11,color:"#5B6EB5",fontWeight:700,marginTop:2}}>Next Week</div>}
          {weekOffset===-1&&<div style={{fontSize:11,color:"#999",fontWeight:700,marginTop:2}}>Last Week</div>}
        </div>
        <button onClick={()=>setWeekOffset(o=>o+1)} style={{background:"#F0F0F8",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,color:"#5B6EB5",fontSize:16}}>›</button>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setWeekOffset(0)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #E0E0E8",background:weekOffset===0?"#5B6EB5":"#fff",color:weekOffset===0?"#fff":"#666",fontWeight:700,fontSize:12,cursor:"pointer"}}>Today</button>
        <a href={`https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(CALENDAR_EMAIL)}`} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",borderRadius:8,background:"#4285F4",color:"#fff",fontWeight:700,fontSize:12,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}>📅 Open Google Calendar</a>
        <a href={`https://calendar.google.com/calendar/r/week/${weekDays[0].getFullYear()}/${weekDays[0].getMonth()+1}/${weekDays[0].getDate()}?authuser=${encodeURIComponent(CALENDAR_EMAIL)}`} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",borderRadius:8,border:"1px solid #4285F4",background:"#fff",color:"#4285F4",fontWeight:700,fontSize:12,textDecoration:"none"}}>📅 This Week in GCal</a>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
        {weekDays.map((day,i)=>{
          const dayStr=toDateStr(day);
          const isToday=dayStr===todayStr;
          const isPast=day<today&&!isToday;
          const dayEvts=eventsOnDay(dayStr);
          return(
            <div key={i} style={{background:isToday?"#EEF0FF":isPast?"#FAFAFA":"#fff",border:`1px solid ${isToday?"#5B6EB5":"#E8E8EC"}`,borderRadius:10,minHeight:120,overflow:"hidden"}}>
              <div style={{padding:"8px 8px 6px",background:isToday?"#5B6EB5":isPast?"#F0F0F4":"#F8F8FC",borderBottom:`1px solid ${isToday?"#4A5BA3":"#E8E8EC"}`,textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",color:isToday?"#BFC8FF":"#999"}}>{DAYS[day.getDay()]}</div>
                <div style={{fontSize:18,fontWeight:800,color:isToday?"#fff":isPast?"#BBB":"#1A1A2E",lineHeight:1.1,marginTop:1}}>{day.getDate()}</div>
              </div>
              <div style={{padding:"6px 5px"}}>
                {dayEvts.map(e=>{
                  const isIcal = e.source==="ical";
                  const cat=isIcal?CATEGORY_CONFIG.tennis:(CATEGORY_CONFIG[e.category]||CATEGORY_CONFIG.other);
                  const pri=isIcal?null:(PRIORITY_CONFIG[e.priority]||PRIORITY_CONFIG.medium);
                  return(
                    <div key={e.id} onClick={()=>!isIcal&&onEdit(e)}
                      title={`${e.title} · ${e.time||""}`}
                      style={{background:cat.color,color:"#fff",borderRadius:5,padding:"3px 6px",marginBottom:4,fontSize:10,fontWeight:700,cursor:isIcal?"default":"pointer",lineHeight:1.3,borderLeft:pri?`3px solid ${pri.color}`:"3px solid rgba(255,255,255,0.4)"}}>
                      <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.time?`${e.time} `:""}{e.title}</div>
                      <div style={{fontSize:9,opacity:0.85}}>{isIcal?"🎾 Neuqua":`👤 ${e.kid}`}</div>
                    </div>
                  );
                })}
                <button onClick={()=>onAddOnDay(dayStr)} style={{width:"100%",border:"1px dashed #D0D0E0",background:"transparent",borderRadius:5,padding:"4px 0",fontSize:11,color:"#BBB",cursor:"pointer",marginTop:dayEvts.length?2:0}}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:14,display:"flex",gap:12,flexWrap:"wrap"}}>
        {Object.entries(CATEGORY_CONFIG).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#666"}}>
            <div style={{width:10,height:10,borderRadius:2,background:v.color}}/>{v.icon} {v.label}
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#666"}}>
          <div style={{width:10,height:10,borderRadius:2,background:"#2E8B57"}}/>🎾 Neuqua Tennis (auto-synced)
        </div>
      </div>

      {(()=>{
        const strs=weekDays.map(toDateStr);
        const wEvts=events.filter(e=>strs.includes(e.date)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||""));
        return wEvts.length>0?(
          <div style={{...sectionStyle,marginTop:16}}>
            <div style={sectionHeader}><span>📋 Events this week</span><span style={{fontSize:12,color:"#999"}}>{wEvts.length} total</span></div>
            {wEvts.map(e=><EventCard key={e.id} event={e} onEdit={onEdit} onDelete={onDelete}/>)}
          </div>
        ):(
          <div style={{textAlign:"center",padding:"30px 0",color:"#ccc"}}>
            <div style={{fontSize:32,marginBottom:8}}>📭</div>No events this week.
          </div>
        );
      })()}
    </div>
  );
}

// ── EventModal ────────────────────────────────────────────────────────────────

function EventModal({ event, prefillDate, onSave, onClose, saving }) {
  const [form, setForm] = useState(event||{title:"",date:prefillDate||"",time:"",kid:"Both",category:"school",priority:"medium",notes:""});
  const set = (k,v)=>setForm(f=>({...f,[k]:v}));
  const canSave = form.title&&form.date&&!saving;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:480,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto"}}>
        <h2 style={{margin:"0 0 20px",color:"#1A1A2E",fontSize:18}}>{event?.id?"Edit Event":"New Event"}</h2>
        <label style={labelStyle}>Event Title</label>
        <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. AP Bio Exam" style={inputStyle} autoFocus/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={labelStyle}>Date</label><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Time</label><input type="time" value={form.time} onChange={e=>set("time",e.target.value)} style={inputStyle}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={labelStyle}>For</label><select value={form.kid} onChange={e=>set("kid",e.target.value)} style={inputStyle}>{KIDS.map(k=><option key={k}>{k}</option>)}</select></div>
          <div><label style={labelStyle}>Category</label><select value={form.category} onChange={e=>set("category",e.target.value)} style={inputStyle}>{Object.entries(CATEGORY_CONFIG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
        </div>
        <label style={labelStyle}>Priority</label>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          {Object.entries(PRIORITY_CONFIG).map(([k,v])=>(
            <button key={k} onClick={()=>set("priority",k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${form.priority===k?v.color:"#E0E0E8"}`,background:form.priority===k?v.bg:"#FAFAFA",color:v.color,fontWeight:700,fontSize:12,cursor:"pointer"}}>{v.dot} {v.label}</button>
          ))}
        </div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Any reminders or details..." rows={2} style={{...inputStyle,resize:"vertical",fontFamily:"inherit"}}/>
        {canSave&&<div style={{marginBottom:14}}><a href={buildGCalURL(form)} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4285F4",textDecoration:"none",fontWeight:600}}>📅 Preview in Google Calendar ↗</a></div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:9,border:"1px solid #E0E0E8",background:"#F5F5F8",cursor:"pointer",fontWeight:600,color:"#555"}}>Cancel</button>
          <button onClick={()=>canSave&&onSave(form)} style={{flex:2,padding:11,borderRadius:9,border:"none",background:canSave?"#5B6EB5":"#C5C5D0",color:"#fff",cursor:canSave?"pointer":"default",fontWeight:700,fontSize:14}}>{saving?"Saving…":event?.id?"Save Changes":"Add Event"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [fbEvents, setFbEvents]     = useState([]);
  const [tennisEvents, setTennis]   = useState([]);
  const [tennisStatus, setTennisStatus] = useState("loading"); // loading | ok | error
  const [loading, setLoading]       = useState(true);
  const [dbError, setDbError]       = useState(null);
  const [modal, setModal]           = useState(null);
  const [prefillDate, setPrefill]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const [tab, setTab]               = useState("dashboard");
  const [filterKid, setFilterKid]           = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [search, setSearch]         = useState("");

  // ── Firebase listener ──
  useEffect(()=>{
    const q=query(collection(db,EVENTS_COL),orderBy("date","asc"));
    const unsub=onSnapshot(q,
      (snap)=>{setFbEvents(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);setDbError(null);},
      (err)=>{setDbError(err.message);setLoading(false);}
    );
    return()=>unsub();
  },[]);

  // ── Neuqua Tennis iCal sync (refresh every 6 hours) ──
  useEffect(()=>{
    fetchTennis();
    const interval = setInterval(fetchTennis, 6*60*60*1000);
    return ()=>clearInterval(interval);
  },[]);

  async function fetchTennis() {
    try {
      const res = await fetch(TENNIS_ICAL_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseICal(text);
      setTennis(parsed.map((e,i)=>({...e, id:`ical-${i}`, source:"ical", category:"tennis", kid:"Both", priority:"medium"})));
      setTennisStatus("ok");
    } catch(err) {
      console.warn("Tennis calendar fetch failed:", err.message);
      setTennisStatus("error");
    }
  }

  // ── All events merged ──
  const events = useMemo(()=>{
    const all = [...fbEvents, ...tennisEvents];
    return all.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||""));
  }, [fbEvents, tennisEvents]);

  // ── Save ──
  async function saveEvent(form) {
    setSaving(true);
    const payload={title:form.title,date:form.date,time:form.time||"",kid:form.kid,category:form.category,priority:form.priority,notes:form.notes||"",updatedAt:serverTimestamp()};
    try{
      if(form.id){await updateDoc(doc(db,EVENTS_COL,form.id),payload);}
      else{await addDoc(collection(db,EVENTS_COL),{...payload,createdAt:serverTimestamp()});}
    }catch(e){alert("Save failed: "+e.message);}
    setSaving(false);setModal(null);setPrefill(null);
  }

  async function deleteEvent(id) {
    if(!window.confirm("Remove this event?"))return;
    try{await deleteDoc(doc(db,EVENTS_COL,id));}
    catch(e){alert("Delete failed: "+e.message);}
  }

  const openAddOnDay=(ds)=>{setPrefill(ds);setModal({});};

  // ── Derived ──
  const today=getToday();
  const todayStr=toDateStr(today);
  const upcoming=events.filter(e=>toDateObj(e.date)>=today);
  const todayEvts=events.filter(e=>e.date===todayStr);
  const wsStart=getWeekStart(today);
  const wsEnd=addDays(wsStart,6);
  const thisWeek=events.filter(e=>{const d=toDateObj(e.date);return d>=wsStart&&d<=wsEnd;});
  const highPri=upcoming.filter(e=>e.priority==="high"&&e.source!=="ical");
  const filtered=upcoming.filter(e=>{
    const mK=filterKid==="All"||e.kid===filterKid||e.kid==="Both";
    const mP=filterPriority==="All"||e.priority===filterPriority;
    const mC=filterCategory==="All"||e.category===filterCategory;
    const mS=!search||e.title.toLowerCase().includes(search.toLowerCase())||(e.notes||"").toLowerCase().includes(search.toLowerCase());
    return mK&&mP&&mC&&mS;
  });

  const TabBtn=({id,label,icon})=>(<button onClick={()=>setTab(id)} style={{padding:"9px 14px",borderRadius:9,border:"none",background:tab===id?"#5B6EB5":"transparent",color:tab===id?"#fff":"rgba(255,255,255,0.6)",fontWeight:tab===id?700:500,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>{icon} {label}</button>);
  const FilterBtn=({label,active,onClick})=>(<button onClick={onClick} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${active?"#5B6EB5":"#E0E0E8"}`,background:active?"#5B6EB5":"#FAFAFA",color:active?"#fff":"#666",fontSize:12,fontWeight:active?700:500,cursor:"pointer"}}>{label}</button>);
  const statCard=(label,value,icon,color)=>(<div style={{background:"#fff",borderRadius:12,padding:"16px 12px",border:"1px solid #E8E8EC",textAlign:"center",flex:1,minWidth:80}}><div style={{fontSize:22}}>{icon}</div><div style={{fontSize:24,fontWeight:800,color,lineHeight:1.1,marginTop:4}}>{value}</div><div style={{fontSize:10,color:"#999",marginTop:3,textTransform:"uppercase",letterSpacing:"0.4px"}}>{label}</div></div>);

  const tennisCount = tennisEvents.filter(e=>toDateObj(e.date)>=today).length;

  return(
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:"#F4F4F8",minHeight:"100vh",paddingBottom:40}}>
      <div style={{background:"linear-gradient(135deg,#1A1A2E 0%,#2D2D5E 100%)",padding:"22px 20px 0",color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:"#9090C0",marginBottom:3}}>Nagar Family</div>
            <h1 style={{margin:0,fontSize:20,fontWeight:800,letterSpacing:"-0.5px"}}>Home Command Center</h1>
            <div style={{fontSize:11,color:"#9090C0",marginTop:3}}>📅 {formatTodayLabel()}</div>
          </div>
          <button onClick={()=>{setPrefill(null);setModal({});}} style={{background:"#E05C3A",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:"0 4px 12px rgba(224,92,58,0.4)",whiteSpace:"nowrap"}}>+ Add Event</button>
        </div>

        <div style={{marginTop:12,background:"rgba(255,255,255,0.08)",borderRadius:8,padding:"7px 12px",fontSize:11,color:"#B0B0D0",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          🔥 Firebase · {loading?"Loading…":`${fbEvents.length} family events`}
          {!dbError&&!loading&&<span style={{color:"#7EC8E3"}}>✓</span>}
          <span style={{color:"#444"}}>·</span>
          🎾 Neuqua Tennis ·{" "}
          {tennisStatus==="loading"&&<span>syncing…</span>}
          {tennisStatus==="ok"&&<span style={{color:"#7EC8E3"}}>{tennisCount} upcoming ✓</span>}
          {tennisStatus==="error"&&<span style={{color:"#E05C3A"}}>sync failed</span>}
        </div>

        <div style={{display:"flex",gap:2,marginTop:14,overflowX:"auto"}}>
          <TabBtn id="dashboard" label="Dashboard" icon="📊"/>
          <TabBtn id="week" label="Week View" icon="📆"/>
          <TabBtn id="schedule" label="All Events" icon="📋"/>
          <TabBtn id="priority" label="Priorities" icon="🔥"/>
        </div>
      </div>

      <div style={{padding:"18px 14px",maxWidth:900,margin:"0 auto"}}>
        {dbError&&<div style={{background:"#FEF0EC",border:"1px solid #E05C3A",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#C0351A"}}>⚠️ <strong>Firebase not connected.</strong> <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{color:"#C0351A"}}>Firebase Console →</a><br/><small>{dbError}</small></div>}

        {loading?(
          <div style={{textAlign:"center",padding:60,color:"#aaa"}}><div style={{fontSize:36,marginBottom:12}}>⏳</div>Loading…</div>
        ):(
          <>
            {tab==="dashboard"&&(
              <>
                <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
                  {statCard("This Week",thisWeek.length,"📆","#5B6EB5")}
                  {statCard("Today",todayEvts.length,"⚡","#E05C3A")}
                  {statCard("High Priority",highPri.length,"🔥","#D4911A")}
                  {statCard("Tennis",tennisCount,"🎾","#2E8B57")}
                </div>

                <div style={sectionStyle}>
                  <div style={sectionHeader}><span>⚡ Today</span><span style={{fontSize:12,color:"#999"}}>{formatDate(todayStr)}</span></div>
                  {todayEvts.length===0?<p style={{color:"#aaa",fontSize:13,margin:"8px 0"}}>Nothing today — enjoy the day!</p>:todayEvts.map(e=><EventCard key={e.id} event={e} onEdit={setModal} onDelete={deleteEvent} compact/>)}
                </div>

                <div style={sectionStyle}>
                  <div style={sectionHeader}>
                    <span>📅 This Week</span>
                    <button onClick={()=>setTab("week")} style={{fontSize:11,color:"#5B6EB5",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Week view →</button>
                  </div>
                  {thisWeek.length===0?<p style={{color:"#aaa",fontSize:13,margin:"8px 0"}}>Nothing this week!</p>:thisWeek.sort((a,b)=>a.date.localeCompare(b.date)).map(e=><EventCard key={e.id} event={e} onEdit={setModal} onDelete={deleteEvent}/>)}
                </div>

                {tennisEvents.filter(e=>toDateObj(e.date)>=today).slice(0,3).length>0&&(
                  <div style={{...sectionStyle,borderLeft:"4px solid #2E8B57"}}>
                    <div style={sectionHeader}>
                      <span>🎾 Upcoming Neuqua Tennis</span>
                      <span style={{fontSize:11,color:"#2E8B57",fontWeight:700}}>Auto-synced</span>
                    </div>
                    {tennisEvents.filter(e=>toDateObj(e.date)>=today).slice(0,3).map(e=><TennisEventCard key={e.id} event={e}/>)}
                  </div>
                )}

                {highPri.length>0&&(
                  <div style={{...sectionStyle,borderLeft:"4px solid #E05C3A"}}>
                    <div style={sectionHeader}><span>🔥 High Priority — Don't Miss</span></div>
                    {highPri.map(e=><EventCard key={e.id} event={e} onEdit={setModal} onDelete={deleteEvent}/>)}
                  </div>
                )}
              </>
            )}

            {tab==="week"&&<WeekView events={events} onEdit={setModal} onDelete={deleteEvent} onAddOnDay={openAddOnDay}/>}

            {tab==="schedule"&&(
              <>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search events…" style={{...inputStyle,background:"#fff"}}/>
                {[
                  {label:"Child",val:filterKid,setVal:setFilterKid,chips:["All",...KIDS].map(k=>({key:k,label:k}))},
                  {label:"Priority",val:filterPriority,setVal:setFilterPriority,chips:[{key:"All",label:"All"},...Object.entries(PRIORITY_CONFIG).map(([k,v])=>({key:k,label:`${v.dot} ${v.label}`}))]},
                  {label:"Category",val:filterCategory,setVal:setFilterCategory,chips:[{key:"All",label:"All"},...Object.entries(CATEGORY_CONFIG).map(([k,v])=>({key:k,label:`${v.icon} ${v.label}`}))]},
                ].map(({label,val,setVal,chips})=>(
                  <div key={label} style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:6}}>{label}</div>
                    <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{chips.map(c=><FilterBtn key={c.key} label={c.label} active={val===c.key} onClick={()=>setVal(c.key)}/>)}</div>
                  </div>
                ))}
                <div style={{fontSize:12,color:"#999",marginBottom:12}}>Showing {filtered.length} event{filtered.length!==1?"s":""}</div>
                {filtered.length===0?<div style={{textAlign:"center",padding:40,color:"#bbb"}}><div style={{fontSize:36,marginBottom:10}}>📭</div>No events match.</div>:filtered.map(e=><EventCard key={e.id} event={e} onEdit={setModal} onDelete={deleteEvent}/>)}
              </>
            )}

            {tab==="priority"&&Object.entries(PRIORITY_CONFIG).map(([pk,pv])=>{
              const group=upcoming.filter(e=>e.priority===pk&&e.source!=="ical");
              return(<div key={pk} style={{...sectionStyle,borderLeft:`4px solid ${pv.color}`}}>
                <div style={{...sectionHeader,color:pv.color}}>
                  <span>{pv.dot} {pv.label} Priority</span>
                  <span style={{fontSize:12,background:pv.bg,color:pv.color,padding:"2px 10px",borderRadius:20,fontWeight:700}}>{group.length} event{group.length!==1?"s":""}</span>
                </div>
                {group.length===0?<p style={{color:"#ccc",fontSize:13,margin:"8px 0"}}>No {pv.label.toLowerCase()} priority events.</p>:group.map(e=><EventCard key={e.id} event={e} onEdit={setModal} onDelete={deleteEvent}/>)}
              </div>);
            })}
          </>
        )}
      </div>

      {modal!==null&&<EventModal event={modal?.id?modal:null} prefillDate={prefillDate} onSave={saveEvent} onClose={()=>{setModal(null);setPrefill(null);}} saving={saving}/>}
    </div>
  );
}

// ── iCal parser (module-level so WeekView can use it) ─────────────────────────

function parseICal(text) {
  const events = [];
  const lines = text.replace(/\r\n /g,"").replace(/\r\n\t/g,"").split(/\r\n|\n|\r/);
  let current = null;
  for (const line of lines) {
    if (line==="BEGIN:VEVENT") { current={}; }
    else if (line==="END:VEVENT"&&current) {
      if(current.date&&current.title) events.push(current);
      current=null;
    } else if (current) {
      if (line.startsWith("SUMMARY:")) current.title=line.replace("SUMMARY:","").trim();
      else if (line.startsWith("DTSTART")) {
        const val=line.split(":").slice(1).join(":").trim();
        const y=val.substring(0,4),m=val.substring(4,6),d=val.substring(6,8);
        current.date=`${y}-${m}-${d}`;
        if (val.includes("T")) {
          const dt=new Date(`${y}-${m}-${d}T${val.substring(9,11)}:${val.substring(11,13)}:00Z`);
          current.time=`${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
        }
      }
      else if (line.startsWith("LOCATION:")) current.notes=line.replace("LOCATION:","").trim();
    }
  }
  return events;
}
