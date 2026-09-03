/* HIGH DECELERATION RATE RISK -- a second real-time score in the risk panel.

   Outcome: will the NEXT 30 minutes of this recording carry a high deceleration
   rate? "High" = the area between the NICHD baseline and the FHR inside detected
   decelerations, per minute of the window, in the top quarter of all minutes of
   the cohort (>= 553 bpm*s per minute). One label per minute, so the score is a
   forecast: the present decelerations are evidence, not the answer.
   Inputs: the webapp's 38 non-deceleration per-minute features + 12 deceleration features computed from the std10 detector.
   Model: gradient-boosted trees on per-minute rows, record-level cross-validation
   (out-of-fold AUROC 0.65-0.79 depending on the minute; persistence baseline
   0.61-0.65). The curves shown here come from the model refit on all records.
   Data: data57/decel_burden.json = {meta, scores: {id: [p per minute]},
         future: {id: [actual area per minute in the next 30 min, null when < 10 min remain]},
         decels: {id: [[a, b], ...] std10 deceleration intervals, minutes before delivery}}.

   This file only adds a tab; it does not change how the hypoxia score is drawn.
   It reads the page's globals (REC, NOW, XS, FIT, ZX, DATA) and wraps setNow /
   drawFig so the cursor and zoom stay shared between the two tabs. */
(function(){
  const BURDEN_COL = '#eb6834', TRUTH_COL = '#6e6e73', FHR_COL = '#333', UC_COL = '#555', DEC_COL = 'rgba(42,120,214,.18)';
  let B = null, TAB = 'hyp', LOADED_FOR = null;
  const W = window;

  const tabs = document.getElementById('risktabs');
  const bfig = document.getElementById('bfig');
  const note = document.getElementById('burdennote');
  const fig  = document.getElementById('fig');
  if(!tabs || !bfig || !fig) return;

  /* Collapse rather than display:none: Plotly's responsive handler resizes every
     plot it owns on a window resize and rejects for a div that is not displayed. */
  const collapse = el => { el.style.display = ''; el.style.height = '0'; el.style.overflow = 'hidden'; el.style.visibility = 'hidden'; };
  const expand   = el => { el.style.display = ''; el.style.height = ''; el.style.overflow = ''; el.style.visibility = ''; };

  async function loadMeta(){
    const src = DATA();
    if(LOADED_FOR === src) return;
    LOADED_FOR = src; B = null;
    try{ if(src.indexOf('data57') >= 0) B = await (await fetch(src + '/decel_burden.json')).json(); }
    catch(e){ B = null; }
  }

  function xrangeNow(){
    const l = fig.layout;
    if(l && l.xaxis && l.xaxis.range) return l.xaxis.range.slice();
    return (typeof ZX !== 'undefined' && ZX) ? ZX.slice() : FIT.slice();
  }

  function draw(){
    if(TAB !== 'burden') return;
    const id = REC && REC.record_id != null ? String(REC.record_id) : null;
    const p = B && id ? B.scores[id] : null;
    if(!p){
      note.textContent = B ? 'No high deceleration rate score for this record.' :
        'The high deceleration rate score is available for the 57-feature arm only.';
      note.style.display = ''; collapse(bfig);
      return;
    }
    const truth = (B.future && B.future[id]) || null;      // what actually happened in the next 30 min, per minute
    const decels = (B.decels && B.decels[id]) || [];        // std10 intervals, the events the label is computed from
    const x = XS;
    const xr = xrangeNow();
    const i = Math.min(NOW, p.length - 1);
    const s = REC.strip;
    const cut = B.meta.cut_bpm_s_per_min, base = B.meta.base_rate, H = B.meta.horizon_min;
    const w0 = x[i], w1 = Math.min(x[i] + H, x[x.length - 1]);
    const tMax = truth ? Math.max(cut * 2.2, ...truth.filter(v => v != null)) : cut * 2.2;
    /* Odds relative to the cohort base rate, on a log axis like the hypoxia panel:
       1x = the base rate (25%), 4x = four times those odds. */
    const oddsBase = base / (1 - base);
    const orr = p.map(v => { const q = Math.min(Math.max(v, 1e-4), 1 - 1e-4); return (q / (1 - q)) / oddsBase; });
    const traces = [];
    traces.push({x:[null], y:[null], mode:'markers', marker:{color:'rgba(235,104,52,.25)', size:12, symbol:'square'}, hoverinfo:'skip',
      name:'next 30 min from the cursor (what the score predicts)', xaxis:'x', yaxis:'y'});
    traces.push({x:x, y:orr, mode:'lines', line:{color:BURDEN_COL, width:2.6},
      name:'score: odds of a high deceleration rate in the next 30 min, vs. the base rate',
      customdata:p, hovertemplate:'%{y:.2f}× (%{customdata:.0%}) at %{x:.0f} min<extra></extra>', xaxis:'x', yaxis:'y'});
    traces.push({x:[x[i]], y:[orr[i]], mode:'markers', marker:{color:BURDEN_COL, size:12, line:{color:'#fff', width:2}},
      hoverinfo:'skip', showlegend:false, xaxis:'x', yaxis:'y'});
    if(truth){
      traces.push({x:x, y:truth, mode:'lines', line:{color:TRUTH_COL, width:1.7, dash:'dash'}, connectgaps:false,
        name:'ground truth: deceleration area per minute in the next 30 min', xaxis:'x', yaxis:'y4',
        hovertemplate:'%{y:.0f} bpm·s/min in the 30 min after %{x:.0f}<extra></extra>'});
      traces.push({x:[xr[0], xr[1]], y:[cut, cut], mode:'lines', line:{color:TRUTH_COL, width:1, dash:'dot'}, hoverinfo:'skip',
        name:'cut for "high" (' + Math.round(cut) + ' bpm·s/min)', xaxis:'x', yaxis:'y4'});
    }
    /* FHR with the standard baseline; std10 deceleration intervals shaded */
    traces.push({x:s.x, y:s.fhr, mode:'lines', line:{color:FHR_COL, width:1}, name:'FHR', hoverinfo:'skip', xaxis:'x2', yaxis:'y2'});
    if(s.base) traces.push({x:s.x, y:s.base, mode:'lines', line:{color:'#c9a400', width:1.4}, name:'baseline', hoverinfo:'skip', xaxis:'x2', yaxis:'y2'});
    traces.push({x:[null], y:[null], mode:'markers', marker:{color:DEC_COL, size:12, symbol:'square'}, name:'decelerations (std10 detector, the events behind the label)', hoverinfo:'skip', xaxis:'x2', yaxis:'y2'});
    traces.push({x:s.x, y:s.uc, mode:'lines', line:{color:UC_COL, width:1}, name:'UC', hoverinfo:'skip', xaxis:'x3', yaxis:'y3'});
    const shapes = [{type:'rect', xref:'x', yref:'y domain', x0:w0, x1:w1, y0:0, y1:1, fillcolor:'rgba(235,104,52,.12)', line:{width:0}, layer:'below'}];
    decels.forEach(([a, b])=>{
      shapes.push({type:'rect', xref:'x2', yref:'y2 domain', x0:a, x1:b, y0:0, y1:1, fillcolor:DEC_COL, line:{width:0}, layer:'below'});
    });
    for(const yref of ['y domain','y2 domain','y3 domain']){
      shapes.push({type:'line', xref:'x', yref:yref, x0:x[i], x1:x[i], y0:0, y1:1, line:{color:'#111', width:1.6}});
    }
    shapes.push({type:'line', xref:'x', yref:'y', x0:xr[0], x1:xr[1], y0:0, y1:0, line:{color:'#8e8e93', width:1, dash:'dot'}});   // log axis: shape y in log10 units, so 0 = 1×
    if(REC.ii_start != null){
      for(const yref of ['y domain','y2 domain','y3 domain']){
        shapes.push({type:'line', xref:'x', yref:yref, x0:REC.ii_start, x1:REC.ii_start, y0:0, y1:1, line:{color:'#7b52c4', width:1.8}});
      }
    }
    const fmtx = v => v >= 10 ? v.toFixed(0) + '×' : v.toFixed(2) + '×';
    const ann = [{x:xr[1], xref:'x', y:0, yref:'y', text:'1× = cohort base rate ' + Math.round(100 * base) + '%', showarrow:false,
                  xanchor:'right', yanchor:'bottom', font:{size:11, color:'#8e8e93'}, bgcolor:'rgba(255,255,255,.8)'},
                 {x:x[i], xref:'x', y:Math.log10(orr[i]), yref:'y', text:fmtx(orr[i]) + ' (' + Math.round(100 * p[i]) + '%)', showarrow:false, xanchor:'left', xshift:9,
                  yanchor:'middle', font:{size:14, color:'#c8471a'}, bgcolor:'rgba(255,255,255,.85)'}];
    const lay = {
      height:700, margin:{l:56, r:70, t:60, b:40}, font:{size:14, family:PLOT_FONT}, hovermode:'closest',
      shapes:shapes, annotations:ann, dragmode:false,
      legend:{orientation:'h', y:1.02, yanchor:'bottom', x:0, font:{size:11}},
      plot_bgcolor:'#fff', paper_bgcolor:'#fff',
      xaxis:{domain:[0,1], anchor:'y', showgrid:true, gridcolor:'#eee', range:xr, autorange:false, minallowed:FIT[0], maxallowed:FIT[1], title:{text:''}},
      yaxis:{domain:[0.52,1], anchor:'x', title:{text:'odds / base rate'}, type:'log', range:[Math.log10(0.03), Math.log10(60)], fixedrange:true, showgrid:true, gridcolor:'#eee',
             tickvals:[0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32], ticktext:['1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8', '16', '32']},
      yaxis4:{overlaying:'y', side:'right', range:[0, tMax], fixedrange:true, showgrid:false,
              title:{text:'actual area, next 30 min (bpm·s/min)', font:{size:11, color:TRUTH_COL}}, tickfont:{size:10, color:TRUTH_COL}},
      xaxis2:{domain:[0,1], anchor:'y2', matches:'x', showgrid:true, gridcolor:'#eee', showticklabels:false},
      yaxis2:{domain:[0.2,0.48], anchor:'x2', title:{text:'FHR (bpm)'}, range:[50,210], fixedrange:true, showgrid:true, gridcolor:'#eee'},
      xaxis3:{domain:[0,1], anchor:'y3', matches:'x', showgrid:true, gridcolor:'#eee', title:{text:'minutes before delivery'}},
      yaxis3:{domain:[0,0.16], anchor:'x3', title:{text:'UC'}, fixedrange:true, showgrid:true, gridcolor:'#eee'}
    };
    expand(bfig); note.style.display = '';
    const atNow = i === p.length - 1 ? 'at delivery' : `${Math.round(-x[i])} min before delivery`;
    const tNow = truth && truth[i] != null ? ` What actually followed: ${Math.round(truth[i])} bpm·s/min (${truth[i] >= cut ? 'high' : 'not high'}).` : '';
    note.innerHTML = `<b>${fmtx(orr[i])}</b> the base-rate odds of a high deceleration rate in the next 30 minutes (probability ${(100*p[i]).toFixed(0)}%), ${atNow} ` +
      `(cohort base rate ${(100*base).toFixed(0)}% = 1×).${tNow} High = deceleration area of at least ${Math.round(cut)} bpm·s per minute ` +
      `inside the window, the top quarter of all minutes. Decelerations shaded on the FHR are the std10 detections the label is computed from. ` +
      `Separate model from the hypoxia score: inputs = the webapp's 38 non-deceleration features + 12 per-minute deceleration features computed from std10 (count, area, depth, duration, time in deceleration over the last 30 / 60 min and so far); out-of-fold AUROC 0.65–0.80 by minute, persistence baseline 0.61–0.65.`;
    Plotly.react(bfig, traces, lay, {displayModeBar:false, scrollZoom:false, responsive:true});
    bfig.onclick = ev=>{
      const xa = bfig._fullLayout && bfig._fullLayout.xaxis; if(!xa) return;
      const bb = bfig.getBoundingClientRect(); const px = ev.clientX - bb.left - xa._offset;
      if(px < 0 || px > xa._length) return;
      const xv = xa.p2d(px); let best = 0, bd = Infinity;
      for(let k = 0; k < x.length; k++){ const d = Math.abs(x[k] - xv); if(d < bd){ bd = d; best = k; } }
      setNow(best);
    };
  }

  function show(tab){
    TAB = tab;
    tabs.querySelectorAll('.pill').forEach(b=> b.classList.toggle('on', b.dataset.t === tab));
    if(tab === 'burden'){
      collapse(fig);
      loadMeta().then(draw);
    }else{
      collapse(bfig); note.style.display = 'none';
      expand(fig);
      try{ const r = Plotly.Plots.resize(fig); if(r && r.catch) r.catch(()=>{}); }catch(e){}
    }
  }
  tabs.addEventListener('click', ev=>{ const b = ev.target.closest('.pill'); if(b) show(b.dataset.t); });

  /* Keep cursor and zoom shared: whatever moves the hypoxia panel also redraws this one.
     Page globals are referenced through window so nothing in this file shadows them. */
  const _setNow = W.setNow;
  W.setNow = function(i){ _setNow(i); if(TAB === 'burden') draw(); };
  const _drawFig = W.drawFig;
  W.drawFig = function(s){ _drawFig(s); if(TAB === 'burden') loadMeta().then(draw); };

  /* Deep link: ?id=1323&tab=burden&before=30 opens that record on that tab with the
     cursor 30 minutes before delivery. boot() loads its own default record, so every
     record fetch in the first seconds is redirected to the wanted one. */
  const q = new URLSearchParams(location.search);
  if(q.get('id')){
    const want = +q.get('id'), tab = q.get('tab') || 'hyp', before = q.get('before');
    const until = Date.now() + 6000;
    const _fetch = W.fetch;
    W.fetch = function(url, ...rest){
      if(Date.now() < until && typeof url === 'string' && /rec_\d+\.json$/.test(url)){
        url = url.replace(/rec_\d+\.json$/, 'rec_' + want + '.json');
      }
      return _fetch.call(this, url, ...rest);
    };
    let done = false;
    const apply = ()=>{
      if(done || typeof REC === 'undefined' || !REC || REC.record_id !== want) return;
      done = true;
      if(typeof mark === 'function') mark(want);
      if(before != null){
        const i = REC.tbd_min.findIndex(v => v <= +before);
        if(i >= 0) setNow(i);
      }
      if(tab === 'burden') show('burden');
    };
    setTimeout(apply, 800); setTimeout(apply, 2500); setTimeout(apply, 5000);
  }
})();
