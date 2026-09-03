/* DECELERATION BURDEN AHEAD -- a second real-time score in the risk panel.

   Outcome: will the NEXT 30 minutes of this recording carry a heavy deceleration
   burden? "Heavy" = the area between the NICHD baseline and the FHR inside
   detected decelerations, per minute of the window, in the top quarter of all
   minutes of the cohort (>= 553 bpm*s per minute). One label per minute, so the
   score is a genuine forecast: the present decelerations are evidence, not the
   answer.
   Inputs: the same 57 per-minute features as the hypoxia score (57-feature arm).
   Model: gradient-boosted trees on per-minute rows, record-level cross-validation
   (out-of-fold AUROC 0.66-0.79 depending on the minute; persistence baseline
   0.61-0.65). The curves shown here come from the model refit on all records.
   Data: data57/decel_burden.json = {meta, scores: {record id: [p per minute]}}.

   This file only adds a tab; it does not change how the hypoxia score is drawn.
   It reads the page's globals (REC, NOW, XS, FIT, ZX, DATA) and wraps setNow /
   drawFig so the cursor and zoom stay shared between the two tabs. */
(function(){
  const BURDEN_COL = '#eb6834', FHR_COL = '#333', UC_COL = '#555', DEC_COL = 'rgba(42,120,214,.16)';
  let B = null, TAB = 'hyp', LOADED_FOR = null;

  const tabs = document.getElementById('risktabs');
  const bfig = document.getElementById('bfig');
  const note = document.getElementById('burdennote');
  const fig  = document.getElementById('fig');
  if(!tabs || !bfig || !fig) return;
  /* Collapse rather than display:none: Plotly's responsive handler resizes every
     plot it owns on a window resize and rejects for a div that is not displayed. */
  const collapse = el => { el.style.display = ''; el.style.height = '0'; el.style.overflow = 'hidden'; el.style.visibility = 'hidden'; };
  const expand   = el => { el.style.display = ''; el.style.height = ''; el.style.overflow = ''; el.style.visibility = ''; };

  async function load(){
    const src = DATA();
    if(LOADED_FOR === src) return;
    LOADED_FOR = src;
    B = null;
    try{
      if(src.indexOf('data57') >= 0){
        B = await (await fetch(src + '/decel_burden.json')).json();
      }
    }catch(e){ B = null; }
  }

  function series(){
    if(!B || !REC) return null;
    const id = REC.record_id != null ? String(REC.record_id) : null;
    const p = id && B.scores[id];
    if(!p) return null;
    /* One value per scored minute; the page's XS is minus tbd_min, same length. */
    return p;
  }

  function xrangeNow(){
    const l = fig.layout;
    if(l && l.xaxis && l.xaxis.range) return l.xaxis.range.slice();
    return (typeof ZX !== 'undefined' && ZX) ? ZX.slice() : FIT.slice();
  }

  function draw(){
    if(TAB !== 'burden') return;
    const p = series();
    if(!p){
      note.textContent = B ? 'No deceleration-burden score for this record.' :
        'The deceleration-burden score is available for the 57-feature arm only.';
      note.style.display = ''; collapse(bfig);
      return;
    }
    const x = XS;
    const xr = xrangeNow();
    const i = Math.min(NOW, p.length - 1);
    const s = REC.strip;
    const cut = B.meta.cut_bpm_s_per_min, base = B.meta.base_rate;
    const traces = [];
    /* the forecast window of the current minute: (now, now + 30 min] */
    const w0 = x[i], w1 = Math.min(x[i] + B.meta.horizon_min, x[x.length - 1]);
    traces.push({x:[w0, w1, w1, w0], y:[0, 0, 1, 1], fill:'toself', mode:'none',
      fillcolor:'rgba(235,104,52,.10)', hoverinfo:'skip', showlegend:true,
      name:'next 30 min from the cursor', xaxis:'x', yaxis:'y'});
    traces.push({x:x, y:p, mode:'lines', line:{color:BURDEN_COL, width:2.4},
      name:'P(next 30 min deceleration-heavy)', hovertemplate:'%{y:.2f} at %{x:.0f} min<extra></extra>',
      xaxis:'x', yaxis:'y'});
    traces.push({x:[x[i]], y:[p[i]], mode:'markers', marker:{color:BURDEN_COL, size:12, line:{color:'#fff', width:2}},
      hoverinfo:'skip', showlegend:false, xaxis:'x', yaxis:'y'});
    /* FHR with the standard baseline, deceleration intervals shaded */
    traces.push({x:s.x, y:s.fhr, mode:'lines', line:{color:FHR_COL, width:1}, name:'FHR',
      hoverinfo:'skip', xaxis:'x2', yaxis:'y2'});
    if(s.base) traces.push({x:s.x, y:s.base, mode:'lines', line:{color:'#c9a400', width:1.4},
      name:'baseline', hoverinfo:'skip', xaxis:'x2', yaxis:'y2'});
    traces.push({x:s.x, y:s.uc, mode:'lines', line:{color:UC_COL, width:1}, name:'UC',
      hoverinfo:'skip', xaxis:'x3', yaxis:'y3'});
    const shapes = [];
    (REC.events || []).forEach(e=>{
      if(e.k !== 'deceleration') return;
      shapes.push({type:'rect', xref:'x2', yref:'y2 domain', x0:e.a, x1:e.b, y0:0, y1:1,
        fillcolor:DEC_COL, line:{width:0}, layer:'below'});
    });
    for(const yref of ['y domain','y2 domain','y3 domain']){
      shapes.push({type:'line', xref:'x', yref:yref, x0:x[i], x1:x[i], y0:0, y1:1, line:{color:'#111', width:1.6}});
    }
    shapes.push({type:'line', xref:'x', yref:'y', x0:xr[0], x1:xr[1], y0:base, y1:base,
      line:{color:'#8e8e93', width:1, dash:'dot'}});
    if(REC.ii_start != null){
      for(const yref of ['y domain','y2 domain','y3 domain']){
        shapes.push({type:'line', xref:'x', yref:yref, x0:REC.ii_start, x1:REC.ii_start, y0:0, y1:1,
          line:{color:'#7b52c4', width:1.8}});
      }
    }
    const ann = [{x:xr[1], xref:'x', y:base, yref:'y', text:'base rate ' + base.toFixed(2), showarrow:false,
      xanchor:'right', yanchor:'bottom', font:{size:11, color:'#8e8e93'}, bgcolor:'rgba(255,255,255,.8)'}];
    const lay = {
      height:680, margin:{l:56, r:14, t:44, b:40}, font:{size:14, family:PLOT_FONT}, hovermode:'closest',
      shapes:shapes, annotations:ann, dragmode:false,
      legend:{orientation:'h', y:1.02, yanchor:'bottom', x:0, font:{size:12}},
      plot_bgcolor:'#fff', paper_bgcolor:'#fff',
      xaxis:{domain:[0,1], anchor:'y', showgrid:true, gridcolor:'#eee', range:xr, autorange:false,
             minallowed:FIT[0], maxallowed:FIT[1], title:{text:''}},
      yaxis:{domain:[0.52,1], anchor:'x', title:{text:'probability'}, range:[0,1], fixedrange:true,
             showgrid:true, gridcolor:'#eee', tickvals:[0,.25,.5,.75,1]},
      xaxis2:{domain:[0,1], anchor:'y2', matches:'x', showgrid:true, gridcolor:'#eee', showticklabels:false},
      yaxis2:{domain:[0.2,0.48], anchor:'x2', title:{text:'FHR (bpm)'}, range:[50,210], fixedrange:true, showgrid:true, gridcolor:'#eee'},
      xaxis3:{domain:[0,1], anchor:'y3', matches:'x', showgrid:true, gridcolor:'#eee', title:{text:'minutes before delivery'}},
      yaxis3:{domain:[0,0.16], anchor:'x3', title:{text:'UC'}, fixedrange:true, showgrid:true, gridcolor:'#eee'}
    };
    expand(bfig); note.style.display = '';
    const atNow = i === p.length - 1 ? 'at delivery' : `${Math.round(-x[i])} min before delivery`;
    note.innerHTML = `<b>${(100*p[i]).toFixed(0)}%</b> chance that the next 30 minutes are deceleration-heavy, ${atNow} ` +
      `(cohort base rate ${(100*base).toFixed(0)}%). Heavy = deceleration area of at least ${Math.round(cut)} bpm·s per minute ` +
      `inside the window, the top quarter of all minutes. Separate model from the hypoxia score, same 57 inputs; ` +
      `out-of-fold AUROC 0.66–0.79 by minute, persistence baseline 0.61–0.65.`;
    Plotly.react(bfig, traces, lay, {displayModeBar:false, scrollZoom:false, responsive:true});
    bfig.onclick = ev=>{
      const xa = bfig._fullLayout && bfig._fullLayout.xaxis;
      if(!xa) return;
      const bb = bfig.getBoundingClientRect();
      const px = ev.clientX - bb.left - xa._offset;
      if(px < 0 || px > xa._length) return;
      const xv = xa.p2d(px);
      let best = 0, bd = Infinity;
      for(let k = 0; k < x.length; k++){ const d = Math.abs(x[k] - xv); if(d < bd){ bd = d; best = k; } }
      setNow(best);
    };
  }

  function show(tab){
    TAB = tab;
    tabs.querySelectorAll('.pill').forEach(b=> b.classList.toggle('on', b.dataset.t === tab));
    if(tab === 'burden'){
      /* Collapse rather than display:none -- Plotly's responsive handler still
         resizes the hidden hypoxia figure and rejects if the div is not displayed. */
      collapse(fig);
      load().then(draw);
    }else{
      collapse(bfig); note.style.display = 'none';
      expand(fig);
      try{ const r = Plotly.Plots.resize(fig); if(r && r.catch) r.catch(()=>{}); }catch(e){}
    }
  }
  tabs.addEventListener('click', ev=>{
    const b = ev.target.closest('.pill'); if(!b) return;
    show(b.dataset.t);
  });

  /* Keep cursor and zoom shared: whatever moves the hypoxia panel also redraws this one. */
  const _setNow = setNow;
  setNow = function(i){ _setNow(i); if(TAB === 'burden') draw(); };
  const _drawFig = drawFig;
  drawFig = function(s){ _drawFig(s); if(TAB === 'burden') load().then(draw); };

  /* Deep link: ?id=1323&tab=burden&before=30 opens that record on that tab with the
     cursor 30 minutes before delivery (used for screenshots and for sharing a view). */
  const q = new URLSearchParams(location.search);
  if(q.get('id')){
    const want = +q.get('id'), tab = q.get('tab') || 'hyp', before = q.get('before');
    /* boot() loads its own default record and may load another one after that.
       Rather than racing it, every record fetch in the first seconds is redirected
       to the wanted record, and the tab / cursor are applied whenever the page
       redraws with that record loaded. */
    const until = Date.now() + 6000;
    const _fetch = window.fetch;
    window.fetch = function(url, ...rest){
      if(Date.now() < until && typeof url === 'string' && /rec_\d+\.json$/.test(url)){
        url = url.replace(/rec_\d+\.json$/, 'rec_' + want + '.json');
      }
      return _fetch.call(this, url, ...rest);
    };
    let applied = 0;
    const apply = ()=>{
      if(typeof REC === 'undefined' || !REC || REC.record_id !== want) return;
      if(typeof mark === 'function') mark(want);
      if(before != null){
        const i = REC.tbd_min.findIndex(v => v <= +before);
        if(i >= 0 && NOW !== i) setNow(i);
      }
      if(tab === 'burden' && TAB !== 'burden') show('burden');
      applied++;
    };
    const _drawFig2 = drawFig;
    drawFig = function(s){ _drawFig2(s); if(Date.now() < until + 2000) apply(); };
    setTimeout(apply, 500); setTimeout(apply, 2500);
  }
})();
