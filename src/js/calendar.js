// ── calendar.js ────────────────────────────────────────────────────────────
// Pay calendar (monthly grid) + date picker (used on add loan page).
// Reads window.allLoans for upcoming payment dates.
// Uses helpers (fmt) from window.*.

import { loanMonthlyIncome, fmt } from '/js/helpers.js';

// Module state
let calYear = 2026;
let calMonth = 3;  // 0-indexed (3 = April)

// Helper getters — read latest state from window at call time
function _allLoans() { return window.allLoans || []; }
function _TODAY() { return window.TODAY || new Date(); }
function _fmt(n) { return (window.fmt || (x => Math.round(x).toLocaleString()))(n); }

// ── CALENDAR ──────────────────────────────────────────────────────────────────
function renderCalendar(){
  const active=(window.allLoans||[]).filter(l=>l.status==='Lending');
  const byDay={};active.forEach(l=>{const d=l.pay_date||10;if(!byDay[d])byDay[d]=[];byDay[d].push(l)});
  const days=Object.keys(byDay).map(Number).sort((a,b)=>a-b);
  document.getElementById('cal-grid').innerHTML=days.map(d=>{
    const ls=byDay[d],total=ls.reduce((a,l)=>a+loanMonthlyIncome(l),0);
    return`<div class="pay-day-group"><div class="pay-day-label"><span class="day-pill">Day ${d}</span><span class="pay-day-total">LKR ${fmt(total)}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim)">${ls.length} loan${ls.length>1?'s':''}</span></div>${ls.map(l=>`<div class="pay-item"><span class="pay-name">${l.creditor_name}</span><span style="color:var(--muted);font-size:11px;font-family:'DM Mono',monospace">${l.broker_name}</span><span class="pay-amt">LKR ${fmt(loanMonthlyIncome(l))}</span></div>`).join('')}</div>`;
  }).join('');
}

// brokers chart imported from /js/brokers.js

// ── DATE PICKER ───────────────────────────────────────────────────────────────
// selectedDate is shared with loans.js — read via window
function _selectedDate() { return window.selectedDate || null; }

function initCalendar(){calYear=(window.TODAY||new Date()).getFullYear();calMonth=(window.TODAY||new Date()).getMonth();renderCalPicker()}
function toggleCal(){const d=document.getElementById('cal-dropdown');const open=!d.classList.contains('hidden');d.classList.toggle('hidden',open);document.getElementById('date-display').classList.toggle('open',!open)}
function closeCal(){document.getElementById('cal-dropdown').classList.add('hidden');document.getElementById('date-display').classList.remove('open')}
function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++}if(calMonth<0){calMonth=11;calYear--}renderCalPicker()}
function renderCalPicker(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
  document.getElementById('cal-month-label').textContent=MONTHS[calMonth]+' '+calYear;
  const first=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let html=DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<first;i++)html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const isToday=d===(window.TODAY||new Date()).getDate()&&calMonth===(window.TODAY||new Date()).getMonth()&&calYear===(window.TODAY||new Date()).getFullYear();
    const isSel=window.selectedDate&&d===window.selectedDate.getDate()&&calMonth===window.selectedDate.getMonth()&&calYear===window.selectedDate.getFullYear();
    html+=`<div class="cal-day${isToday?' today':''}${isSel?' selected':''}" onclick="selectCalDay(${d})">${d}</div>`;
  }
  document.getElementById('cal-grid-picker').innerHTML=html;
}
function selectCalDay(d){
  window.selectedDate=new Date(calYear,calMonth,d); if(typeof selectedDate!=="undefined") selectedDate=window.selectedDate;
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthStr=MONTHS[calMonth]+'-'+String(calYear).slice(2);
  const isoStr=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  document.getElementById('f-month').value=monthStr;
  document.getElementById('date-display-text').textContent=window.selectedDate.toLocaleDateString('en-LK',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('date-display-text').style.color='var(--text)';
  document.getElementById('date-display').dataset.iso=isoStr;
  renderCalPicker();closeCal();window.loanPreview?.();
}

// Initialise calMonth/calYear to today on first load
calYear = (window.TODAY || new Date()).getFullYear();
calMonth = (window.TODAY || new Date()).getMonth();

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  renderCalendar, initCalendar, toggleCal, closeCal, calNav,
  renderCalPicker, selectCalDay,
});
