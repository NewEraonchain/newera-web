/* generative art tiles */
  (function(){
    var grid=document.getElementById('tiles');
    var tags=['prompt #0421','neon koi','synthwave','liquid chrome','dreamscape','vaporwave',
              'aurora','glass orb','bio-bloom','fractal','solar flare','holo cat','ink wash','prism','nebula'];
    var SPARK='<svg class="spark" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>';
    function art(){
      var h1=Math.floor(Math.random()*360), h2=(h1+40+Math.random()*120)%360, h3=(h1+200+Math.random()*60)%360;
      return 'background:'
        +'radial-gradient(120% 90% at 28% 20%,hsl('+h1+' 90% 62%) 0%,transparent 55%),'
        +'radial-gradient(120% 100% at 80% 85%,hsl('+h2+' 85% 55%) 0%,transparent 60%),'
        +'linear-gradient(150deg,hsl('+h3+' 70% 16%),#070708)';
    }
    var cols=[[],[],[]], per=[4,4,4];
    var ti=0;
    for(var c=0;c<3;c++){
      for(var k=0;k<per[c];k++){
        var imgNum = ti + 1; // 1 to 12
        var shimmer = (ti%5===2);
        var html='<div class="tile'+(shimmer?' shimmer':'')+'">'
          +'<img src="images/'+imgNum+'.jpeg" alt="AI creation '+imgNum+'" loading="lazy" '
          +'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0">'
          +(shimmer?'<span class="sh"></span>':'')
          +SPARK
          +'</div>';
        cols[c].push(html); ti++;
      }
    }
    grid.innerHTML=
      '<div class="tcol">'+cols[0].join('')+cols[0].join('')+'</div>'+
      '<div class="tcol mid">'+cols[1].join('')+cols[1].join('')+'</div>'+
      '<div class="tcol">'+cols[2].join('')+cols[2].join('')+'</div>';
  })();

  /* entrance reveal */
  (function(){
    document.querySelectorAll('.stats-intro,.stat-card,.features-intro,.fcard,.gallery-head,.news-top,.faq-head,.faq-item,.foot-frame').forEach(function(el){ if(!el.hasAttribute('data-rv')) el.setAttribute('data-rv',''); });
    var els=Array.prototype.slice.call(document.querySelectorAll('[data-rv]'));
    var keyer=0, counts={};
    els.forEach(function(e){
      var p=e.parentNode; if(p.__rvk==null){p.__rvk=++keyer;counts[p.__rvk]=0;}
      var idx=counts[p.__rvk]++;
      e.style.transitionDelay=Math.min(idx*70,350)+'ms';
    });
    if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in');}); return; }
    var io=new IntersectionObserver(function(en){ en.forEach(function(x){ if(x.isIntersecting){ x.target.classList.add('in'); io.unobserve(x.target); } }); },{threshold:.12});
    els.forEach(function(e){ io.observe(e); });
  })();

  /* how-it-works: scroll-stacking cards + faq */
  (function(){
    var stack=document.getElementById('stack'); if(!stack) return;
    var cards=Array.prototype.slice.call(stack.querySelectorAll('.s-card'));
    var N=cards.length;
    function update(){
      var total=stack.offsetHeight-window.innerHeight;
      var passed=Math.min(Math.max(-stack.getBoundingClientRect().top,0),Math.max(total,1));
      var p=total>0?passed/total:0, active=p*(N-1);
      for(var i=0;i<N;i++){
        var t=active-i, ty, sc, op;
        if(t>=0){ ty=-t*116; op=Math.max(0,1-t*1.15); sc=1-t*0.05; }
        else { var tt=Math.max(t,-3); ty=tt*4; sc=1+tt*0.05; op=1; }
        var c=cards[i];
        c.style.transform='translateY('+ty.toFixed(2)+'%) scale('+sc.toFixed(3)+')';
        c.style.opacity=op.toFixed(3);
        c.style.zIndex=String(500-Math.round(Math.abs(t)*100));
      }
    }
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    update();
  })();

  /* stats count-up - real numbers from backend /stats */
  (function(){
    var API = "https://newerabackend-production.up.railway.app"; // backend URL (change when deployed)
    var nums=document.querySelectorAll('.stat-num[data-to]'); if(!nums.length) return;
    function fmt(n){return Math.floor(n).toLocaleString();}
    function run(el){var to=+el.getAttribute('data-to'),dur=1500,st=null;
      function step(ts){if(!st)st=ts;var p=Math.min((ts-st)/dur,1),e=1-Math.pow(1-p,3);
        el.textContent=fmt(to*e);if(p<1)requestAnimationFrame(step);else el.textContent=fmt(to);}
      requestAnimationFrame(step);}

    // fetch real stats from backend, update the data-to values
    fetch(API + "/stats")
      .then(function(r){ return r.json(); })
      .then(function(s){
        // map backend fields -> the 3 cards (in order)
        var values = [
          s.totalImages || 0,             // card 1: Total images generated
          s.activeListings || 0,          // card 2: Total images for sale
          s.totalPromptsForSale || 0      // card 3: Total prompts for sale
        ];
        nums.forEach(function(el, i){
          if (values[i] != null) el.setAttribute('data-to', values[i]);
        });
        startAnim();
      })
      .catch(function(err){
        console.log("Stats fetch failed, using defaults:", err);
        startAnim(); // agar backend off ho to bhi animate kare (fallback)
      });

    function startAnim(){
      if(!('IntersectionObserver' in window)){nums.forEach(run);return;}
      var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){run(e.target);io.unobserve(e.target);}});},{threshold:.4});
      nums.forEach(function(n){io.observe(n);});
    }
  })();

  /* gallery railway */
  (function(){
    var track=document.getElementById('railTrack'); if(!track) return;
    var items=[
      {img:'images/G1.png',t:'Molten ember koi',m:'120 NEA'},
      {img:'images/G2.png',t:'Marbled gold terrain',m:'90 NEA'},
      {img:'images/G3.png',t:'Otherworldly oceans',m:'150 NEA'},
      {img:'images/G4.png',t:'Neon cyber-fauna',m:'210 NEA'},
      {img:'images/G5.png',t:'Bioluminescent bloom',m:'80 NEA'},
      {img:'images/G6.png',t:'Fractal nebula',m:'175 NEA'},
      {img:'images/G7.png',t:'Liquid chrome serpent',m:'195 NEA'},
      {img:'images/G8.png',t:'Crystalline phoenix',m:'240 NEA'},
      {img:'images/G9.png',t:'Inkwash mountains',m:'85 NEA'},
      {img:'images/G10.png',t:'Solar flare deity',m:'220 NEA'},
      {img:'images/G11.png',t:'Glass orchid',m:'130 NEA'}
    ];
    function card(it){
      var art = it.img
        ? '<div class="art"><img src="'+it.img+'" alt="'+it.t+'" loading="lazy"></div>'
        : '<div class="art" style="background:'+it.g+'"></div>';
      return '<div class="gcard">'+art
        +'<div class="cap"><span class="gt">'+it.t+'</span>'
        +'<span class="gm"><b>'+it.m+'</b></span></div></div>';
    }
    var html=items.map(card).join('');
    track.innerHTML=html+html; /* duplicate for seamless infinite loop */
  })();

  /* news from Substack (auto-updates when you publish) */
  (function(){
    var row=document.getElementById('newsRow'); if(!row) return;
    var API = "https://newerabackend-production.up.railway.app/news";

    function esc(s){return (s||"").replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    function fmtDate(d){try{return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(e){return "";}}
    var arrow='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>';

    function card(item){
      return '<a class="news-card" href="'+esc(item.link||"#")+'" target="_blank" rel="noopener">'
        +'<div class="news-logo"><span class="src"><i></i>NewEra</span></div>'
        +'<div class="news-title">'+esc(item.title||"Untitled")+'</div>'
        +'<div class="news-meta"><span class="news-date">'+fmtDate(item.pubDate)+'</span>'
        +'<span class="news-read">Read '+arrow+'</span></div></a>';
    }

    fetch(API)
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(!data || data.status!=="ok" || !data.items || !data.items.length){
          row.innerHTML='<div class="news-loading">No posts yet. Check back soon.</div>'; return;
        }
        row.innerHTML = data.items.slice(0,9).map(card).join('');
        wireArrows();
      })
      .catch(function(err){
        console.log("News feed failed:", err);
        row.innerHTML='<div class="news-loading">Updates are on the way.</div>';
      });

    function wireArrows(){
      function amt(){var c=row.querySelector('.news-card');return c?c.getBoundingClientRect().width+22:322;}
      var p=document.getElementById('newsPrev'),n=document.getElementById('newsNext');
      if(p)p.addEventListener('click',function(){row.scrollBy({left:-amt(),behavior:'smooth'});});
      if(n)n.addEventListener('click',function(){row.scrollBy({left:amt(),behavior:'smooth'});});
    }
  })();

  /* FAQ accordion (single open) */
  (function(){
    document.addEventListener('click',function(e){
      var q=e.target.closest && e.target.closest('.faq-q'); if(!q) return;
      var it=q.parentElement, wasOpen=it.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(function(x){x.classList.remove('open');});
      if(!wasOpen) it.classList.add('open');
    });
  })();

  /* finale arc layout + scroll reveal (cards burst from center into the round) */
  (function(){
    var arc=document.getElementById('arc'); if(!arc) return;
    var center=arc.querySelector('.arc-center');
    var imgs=['A1','A2','A3','A4','A5','A6','A7','A8'];
    var cards=imgs.map(function(name){
      var c=document.createElement('div');c.className='acard';
      c.innerHTML='<div class="art"><img src="images/'+name+'.png" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>';
      arc.appendChild(c);return c;
    });

    var revealed=false;            // has the burst played
    var lastTransforms=[];         // final transform per visible card

    function layout(){
      var w=arc.clientWidth, size, R, span=300, start=-150, list=cards;
      cards.forEach(function(c){c.style.display='';});
      if(w<600){
        list=cards.filter(function(c,i){return i%2===0;});
        cards.forEach(function(c){if(list.indexOf(c)<0)c.style.display='none';});
        size=(w<460?76:92); span=210; start=-105;
        R=Math.min(w*0.42, w/2-size/2-18);
      } else if(w<900){
        size=130; R=Math.min(w*0.42, w/2-size/2-16);
      } else {
        size=160; R=Math.min(370, w*0.42);
      }
      var N=list.length;
      lastTransforms=[];
      list.forEach(function(c,i){
        c.style.width=c.style.height=size+'px';
        c.style.marginLeft=(-size/2)+'px';c.style.marginTop=(-size/2)+'px';
        var A=start + i*(span/(N-1));
        var finalT='rotate('+A+'deg) translateY(-'+R+'px) rotate('+(-A*0.62).toFixed(1)+'deg)';
        lastTransforms.push(finalT);
        // collapsed state: stacked low in the center, small and hidden
        var collapsed='translateY('+(R*0.5)+'px) scale(.3)';
        c.style.transition='none';
        c.style.transform = revealed ? finalT : collapsed;
        c.style.opacity   = revealed ? '1' : '0';
        c.dataset.idx=i;
      });
      arc.style.height=(R*1.95+size)+'px';
    }

    function burst(){
      if(revealed) return; revealed=true;
      var visible=cards.filter(function(c){return c.style.display!=='none';});
      visible.forEach(function(c,i){
        // each card waits its turn (stagger), then springs out to its spot
        setTimeout(function(){
          c.style.transition='transform 1s cubic-bezier(.18,.9,.25,1.15),opacity .6s ease';
          c.style.transform=lastTransforms[+c.dataset.idx];
          c.style.opacity='1';
        }, i*110);
      });
    }

    layout();
    window.addEventListener('resize',function(){ layout(); });

    // users who prefer no motion: show the arc instantly
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches){
      revealed=true; layout(); return;
    }

    // trigger the burst when the arc scrolls into view
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(en){
        en.forEach(function(x){ if(x.isIntersecting){ burst(); io.disconnect(); } });
      },{threshold:.35});
      io.observe(arc);
    } else {
      revealed=true; layout();
    }
  })();

  (function(){var b=document.getElementById('backtop');if(b)b.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});})();