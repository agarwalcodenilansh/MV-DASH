// ─── MVIKAS LIVE DASHBOARD — API-POWERED ─────────────────────────────────────
// This file replaces the static script.js entirely.
// It fetches live data from the Python backend every 5 minutes.

// ── CONFIG: point this at your deployed backend URL ──────────────────────────
const API_URL = window.DASHBOARD_API_URL || "http://localhost:5000/api/dashboard-data";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Chart.js defaults
Chart.defaults.color = '#475569';
Chart.defaults.font.family = 'Inter, system-ui, -apple-system, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a';
Chart.defaults.plugins.tooltip.borderColor = '#1e293b';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 13 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.scale.grid.color = '#e2e8f0';
Chart.defaults.scale.ticks.color = '#475569';

// Tab switcher
function switchTab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected','true');
}
window.switchTab = switchTab;

// Destroy and recreate charts on refresh
const chartInstances = {};
function makeChart(id, config) {
  if (chartInstances[id]) { chartInstances[id].destroy(); }
  chartInstances[id] = new Chart(document.getElementById(id), config);
}

const chartFont = { size: 11, weight: '500' };

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render(d) {
  const { meta, kpis, openData, eddData, dueData, bookedData, dailyData, clients, kamList } = d;

  // ── HEADER ──
  const elDate = document.querySelector('.badge-date');
  const elElapsed = document.querySelector('.badge-elapsed');
  if (elDate) elDate.textContent = `As of ${meta.reportDate}`;
  if (elElapsed) elElapsed.textContent = `${meta.dayOfMonth} / ${meta.daysInMonth} days elapsed · ${meta.monthLabel}`;

  // ── KPI CARDS ──
  document.getElementById('kpi-open').textContent = kpis.openTotal;
  document.getElementById('kpi-edd').textContent  = kpis.eddTotal;
  document.getElementById('kpi-edd-pct').textContent = `${kpis.eddPct}% of open`;
  document.getElementById('kpi-due').textContent  = kpis.dueTotal;

  if (meta.isSunday) {
    document.getElementById('kpi-booked').textContent = '—';
    try { document.getElementById('kpi-booked').closest('.metric').querySelector('.metric-sub').textContent = 'Sunday — no dispatch'; } catch(e){}
    document.getElementById('kpi-daily-ton').innerHTML = '— <span style="font-size:0.9rem;font-weight:500;color:#94a3b8">Sunday</span>';
    try { document.getElementById('kpi-daily-ton').closest('.metric').querySelector('.metric-sub').textContent = 'No dispatch on Sundays'; } catch(e){}
  } else {
    document.getElementById('kpi-booked').textContent = kpis.bookedTotal;
    try { document.getElementById('kpi-booked').closest('.metric').querySelector('.metric-sub').textContent = meta.yesterday; } catch(e){}
    document.getElementById('kpi-daily-ton').innerHTML = `${kpis.dailyTotal.toLocaleString('en-IN',{maximumFractionDigits:2})} <span style="font-size:0.9rem;font-weight:600">kg</span>`;
    try { document.getElementById('kpi-daily-ton').closest('.metric').querySelector('.metric-sub').textContent = 'All clients combined'; } catch(e){}
  }

  document.getElementById('kpi-month-ton').innerHTML = `${kpis.monthlyTotal.toLocaleString('en-IN',{maximumFractionDigits:2})} <span style="font-size:0.9rem;font-weight:600">kg</span>`;
  try { document.getElementById('kpi-month-ton').closest('.metric').querySelector('.metric-sub').textContent = `${meta.monthLabel} cumulative`; } catch(e){}
  document.getElementById('kpi-daily-avg').innerHTML = `${kpis.dailyAvg.toLocaleString('en-IN')} <span style="font-size:0.9rem;font-weight:600">kg/day</span>`;

  // ── OPEN SHIPMENTS TABLE ──
  const openTableBody = document.getElementById('open-table-body');
  if (openTableBody) {
    openTableBody.innerHTML = '';
    openData.forEach((d, i) => {
      const eddCount = (eddData.find(e => e.name === d.name) || {}).count || 0;
      const dueCount = (dueData.find(e => e.name === d.name) || {}).count || 0;
      const pct  = Math.round(eddCount / d.count * 100);
      const risk = pct >= 70 ? ['Critical','delayed'] : pct >= 40 ? ['High','delayed'] : pct >= 20 ? ['Medium','open'] : ['Low','due'];
      openTableBody.innerHTML += `<tr>
        <td style="color:#94a3b8;font-size:0.8rem">${i+1}</td>
        <td><strong>${d.name}</strong></td>
        <td>${d.count}</td>
        <td style="color:#dc2626;font-weight:600">${eddCount}</td>
        <td style="color:#d97706;font-weight:600">${dueCount}</td>
        <td style="color:${pct>=50?'#dc2626':'#d97706'};font-weight:700">${pct}%</td>
        <td><span class="badge ${risk[1]}">${risk[0]}</span></td>
      </tr>`;
    });
  }

  // ── CHART 1 · Status Donut ──
  makeChart('statusDonut', {
    type: 'doughnut',
    data: {
      labels: ['EDD Crossed','Open (in transit)','Due Tomorrow','Booked Yesterday'],
      datasets: [{ data: [kpis.eddTotal, kpis.openTotal - kpis.eddTotal, kpis.dueTotal, kpis.bookedTotal],
        backgroundColor: ['#ef4444','#3b82f6','#f59e0b','#10b981'], borderWidth:2, borderColor:'#fff', hoverOffset:6 }]
    },
    options: { responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins: { legend:{display:false}, tooltip:{callbacks:{label: ctx => ` ${ctx.label}: ${ctx.parsed}`}} } }
  });

  // ── CHART 2 · EDD Crossed ──
  makeChart('eddBarChart', {
    type:'bar',
    data: { labels: eddData.map(d=>d.name), datasets:[{ label:'EDD Crossed', data:eddData.map(d=>d.count),
      backgroundColor:'rgba(239,68,68,0.12)', borderColor:'#ef4444', borderWidth:1.5, borderRadius:4 }] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ x:{beginAtZero:true,ticks:{font:{size:11}}}, y:{ticks:{font:{size:11,weight:'500'}},grid:{display:false}} } }
  });

  // ── CHART 3 · Due Tomorrow ──
  makeChart('dueTmrChart', {
    type:'bar',
    data: { labels: dueData.map(d=>d.name), datasets:[{ label:`Due ${meta.tomorrow}`, data:dueData.map(d=>d.count),
      backgroundColor:'rgba(245,158,11,0.12)', borderColor:'#f59e0b', borderWidth:1.5, borderRadius:4 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{autoSkip:false,maxRotation:30,font:{size:11,weight:'500'}},grid:{display:false}}, y:{beginAtZero:true} } }
  });

  // ── CHART 4 · Booked Yesterday ──
  if (meta.isSunday || bookedData.length === 0) {
    const ctx = document.getElementById('bookedChart');
    if (ctx) { const c = ctx.getContext('2d'); c.font='600 14px Inter,system-ui'; c.fillStyle='#94a3b8'; c.textAlign='center'; c.fillText('☀️  Sunday — no bookings', ctx.width/2, 80); }
  } else {
    makeChart('bookedChart', {
      type:'bar',
      data: { labels:bookedData.map(d=>d.name), datasets:[{ label:`Booked ${meta.yesterday}`, data:bookedData.map(d=>d.count),
        backgroundColor:'rgba(16,185,129,0.12)', borderColor:'#10b981', borderWidth:1.5, borderRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{autoSkip:false,maxRotation:30,font:{size:11,weight:'500'}},grid:{display:false}}, y:{beginAtZero:true} } }
    });
  }

  // ── PANEL 2 · Tonnage Bars ──
  const barsEl = document.getElementById('tonnage-bars');
  if (barsEl) {
    barsEl.innerHTML = '';
    const clientsWithTarget = clients.filter(c => c.target > 0).sort((a,b) => b.target - a.target);
    const clientsNoTarget   = clients.filter(c => c.target === 0 && c.achieved > 0).sort((a,b) => b.achieved - a.achieved);
    const sorted = [...clientsWithTarget, ...clientsNoTarget];
    sorted.forEach(c => {
      const hasTgt = c.target > 0;
      const pctCapped = hasTgt ? Math.min(c.pct, 100) : 100;
      const grad = hasTgt
        ? (c.pct >= 100 ? 'linear-gradient(90deg,#059669,#10b981)' : c.pct >= 60 ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#dc2626,#ef4444)')
        : 'linear-gradient(90deg,#004df5,#3b82f6)';
      const pctLabel = hasTgt ? (c.pct >= 999 ? '∞%' : `${c.pct}%`) : 'TBD';
      const tonLabel = hasTgt ? `${(c.achieved/1000).toFixed(2)}T / ${(c.target/1000).toFixed(0)}T` : `${(c.achieved/1000).toFixed(2)}T`;
      barsEl.innerHTML += `<div class="client-row">
        <div class="client-name" title="${c.name}">${c.name}</div>
        <div class="client-person">${c.person}</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${pctCapped}%;background:${grad}"></div></div>
        <div class="pct-text" style="${!hasTgt?'color:#94a3b8;font-size:0.75rem':''}">${pctLabel}</div>
        <div class="client-tonnage">${tonLabel}</div>
      </div>`;
    });
  }

  const top8 = [...clients].filter(c=>c.achieved>0).sort((a,b)=>b.achieved-a.achieved).slice(0,8);

  // ── CHART 5 · Target distribution ──
  const withTargets = top8.filter(c => c.target > 0);
  if (withTargets.length > 0) {
    makeChart('targetChart', { type:'bar',
      data:{ labels:withTargets.map(c=>c.name), datasets:[{ label:'Monthly target (kg)', data:withTargets.map(c=>c.target),
        backgroundColor:'rgba(0,77,245,0.12)', borderColor:'#004df5', borderWidth:1.5, borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{beginAtZero:true,ticks:{callback:v=>(v/1000).toFixed(0)+'k',font:chartFont}}, y:{ticks:{font:chartFont},grid:{display:false}} } }
    });
  } else {
    makeChart('targetChart', { type:'bar',
      data:{ labels:top8.map(c=>c.name), datasets:[{ label:'Achieved (kg)', data:top8.map(c=>c.achieved),
        backgroundColor:'rgba(0,77,245,0.12)', borderColor:'#004df5', borderWidth:1.5, borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, title:{display:true,text:'Monthly targets TBD — showing achieved',font:{size:11},color:'#94a3b8'} },
        scales:{ x:{beginAtZero:true,ticks:{callback:v=>(v/1000).toFixed(0)+'k',font:chartFont}}, y:{ticks:{font:chartFont},grid:{display:false}} } }
    });
  }

  // ── CHART 6 · Achieved vs Target ──
  makeChart('achChart', { type:'bar',
    data:{ labels:top8.map(c=>c.name), datasets:[
      { label:'Achieved (kg)', data:top8.map(c=>c.achieved), backgroundColor:'rgba(16,185,129,0.15)', borderColor:'#10b981', borderWidth:1.5, borderRadius:4 },
      ...(withTargets.length > 0 ? [{ label:'Target (kg)', data:top8.map(c=>c.target||0), backgroundColor:'rgba(71,85,105,0.08)', borderColor:'#475569', borderWidth:1.5, borderRadius:4 }] : [])
    ]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom',labels:{boxWidth:12,padding:16,font:chartFont}},
        title:{display:true,text:`${meta.monthLabel} — Day ${meta.dayOfMonth} (${meta.activeDaysElapsed} active days)`,font:{size:11},color:'#94a3b8'} },
      scales:{ x:{beginAtZero:true,ticks:{callback:v=>(v/1000).toFixed(0)+'k',font:chartFont}}, y:{ticks:{font:chartFont},grid:{display:false}} } }
  });

  // ── PANEL 3 · Daily Average Table ──
  const tbody = document.getElementById('daily-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    clients.filter(c => c.achieved > 0).forEach(c => {
      const hasTgt = c.target > 0;
      const pctColor = c.pct >= 100 ? '#059669' : c.pct >= 60 ? '#d97706' : '#dc2626';
      const dayColor = c.daysNeeded === 0 ? '#059669' : c.daysNeeded <= 5 ? '#059669' : c.daysNeeded <= 10 ? '#d97706' : '#dc2626';
      tbody.innerHTML += `<tr>
        <td style="font-weight:600">${c.name}</td>
        <td style="font-size:0.8rem;color:#64748b">${c.person}</td>
        <td>${hasTgt ? c.target.toLocaleString('en-IN') : '<span style="color:#94a3b8">TBD</span>'}</td>
        <td>${c.achieved.toLocaleString('en-IN')}</td>
        <td style="color:${hasTgt?pctColor:'#94a3b8'};font-weight:700">${hasTgt ? (c.pct>=999?'∞%':`${c.pct}%`) : '—'}</td>
        <td>${c.activeDays}</td>
        <td>${c.avgDay.toLocaleString('en-IN')}</td>
        <td>${hasTgt && c.remaining>0 ? c.remaining.toLocaleString('en-IN') : '—'}</td>
        <td style="color:${hasTgt?dayColor:'#94a3b8'};font-weight:700">${hasTgt ? (c.remaining===0?'✓ Done':c.daysNeeded===999?'N/A':`${c.daysNeeded} days`) : 'TBD'}</td>
      </tr>`;
    });
  }

  // ── CHART 7 · Avg kg/day ──
  const topAvg = [...clients].filter(c=>c.avgDay>0).sort((a,b)=>b.avgDay-a.avgDay).slice(0,10);
  makeChart('avgDayChart', { type:'bar',
    data:{ labels:topAvg.map(c=>c.name), datasets:[{ label:'Avg kg/day', data:topAvg.map(c=>c.avgDay),
      backgroundColor:'rgba(99,102,241,0.12)', borderColor:'#6366f1', borderWidth:1.5, borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{beginAtZero:true,ticks:{callback:v=>v.toLocaleString('en-IN'),font:chartFont}}, y:{ticks:{font:chartFont},grid:{display:false}} } }
  });

  // ── CHART 8 · Days to complete ──
  const daysFiltered = clients.filter(c => c.target>0 && c.remaining>0 && c.daysNeeded<999);
  if (daysFiltered.length > 0) {
    const daysColors  = daysFiltered.map(c => c.daysNeeded<=3?'rgba(16,185,129,0.15)':c.daysNeeded<=10?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)');
    const daysBorders = daysFiltered.map(c => c.daysNeeded<=3?'#10b981':c.daysNeeded<=10?'#f59e0b':'#ef4444');
    makeChart('daysChart', { type:'bar',
      data:{ labels:daysFiltered.map(c=>c.name), datasets:[{ label:'Days to complete', data:daysFiltered.map(c=>c.daysNeeded),
        backgroundColor:daysColors, borderColor:daysBorders, borderWidth:1.5, borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.x} days needed`}}},
        scales:{ x:{beginAtZero:true,ticks:{font:chartFont}}, y:{ticks:{font:chartFont},grid:{display:false}} } }
    });
  } else {
    const el = document.getElementById('daysChart');
    if (el) { const ctx=el.getContext('2d'); ctx.font='13px Inter,system-ui'; ctx.fillStyle='#94a3b8'; ctx.textAlign='center';
      ctx.fillText('Monthly targets TBD — chart will populate once set', el.width/2, 80); }
  }

  // ── PANEL 4 · KAM Performance ──
  const kamTbody = document.getElementById('kam-table-body');
  if (kamTbody) {
    kamTbody.innerHTML = '';
    kamList.forEach(k => {
      const pct = k.totalTarget > 0 ? Math.round(k.totalAchieved/k.totalTarget*100) : 0;
      const color = pct>=80?'#059669':pct>=50?'#d97706':'#dc2626';
      const grad  = pct>=80?'linear-gradient(90deg,#059669,#10b981)':pct>=50?'linear-gradient(90deg,#d97706,#fbbf24)':'linear-gradient(90deg,#dc2626,#ef4444)';
      kamTbody.innerHTML += `<tr>
        <td style="font-weight:700">${k.person}</td>
        <td>${k.clients.length}</td>
        <td>${k.totalTarget>0?k.totalTarget.toLocaleString('en-IN'):'<span style="color:#94a3b8">TBD</span>'}</td>
        <td>${k.totalAchieved.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
        <td style="color:${k.totalTarget>0?color:'#004df5'};font-weight:700">${k.totalTarget>0?pct+'%':'—'}</td>
        <td><div style="background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden;width:120px">
          <div style="height:100%;border-radius:99px;width:${k.totalTarget>0?Math.min(pct,100):100}%;background:${k.totalTarget>0?grad:'linear-gradient(90deg,#004df5,#3b82f6)'}"></div>
        </div></td>
      </tr>`;
    });
  }

  makeChart('kamDonut', { type:'doughnut',
    data:{ labels:kamList.map(k=>k.person), datasets:[{ data:kamList.map(k=>k.totalAchieved),
      backgroundColor:['#004df5','#10b981','#f59e0b','#ef4444','#6366f1','#ec4899'], borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{position:'bottom',labels:{boxWidth:12,padding:12,font:{size:11}}},
        tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${(ctx.parsed/1000).toFixed(2)}T`}} } }
  });
}

// ─── FETCH + REFRESH LOOP ─────────────────────────────────────────────────────
function showStatus(msg, type = 'info') {
  const existing = document.getElementById('dash-status');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.id = 'dash-status';
  bar.style.cssText = `position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;font-size:0.8125rem;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);
    background:${type==='error'?'#fef2f2':type==='success'?'#ecfdf5':'#eff6ff'};
    color:${type==='error'?'#991b1b':type==='success'?'#065f46':'#1e40af'};
    border:1px solid ${type==='error'?'#fecaca':type==='success'?'#a7f3d0':'#bfdbfe'}`;
  bar.textContent = msg;
  document.body.appendChild(bar);
  if (type !== 'loading') setTimeout(() => bar.remove(), 4000);
}

async function loadData() {
  showStatus('⟳ Refreshing data…', 'loading');
  try {
    const res  = await fetch(API_URL);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message || 'API error');
    render(json.data);
    const ts = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    showStatus(`✓ Updated at ${ts}`, 'success');
  } catch (err) {
    console.error('Dashboard fetch error:', err);
    showStatus(`✗ Could not load data: ${err.message}`, 'error');
  }
}

// Initial load + auto-refresh
loadData();
setInterval(loadData, REFRESH_INTERVAL_MS);