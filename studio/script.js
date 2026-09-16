/* nav active */
  document.getElementById('nav').addEventListener('click',function(e){
    var b=e.target.closest('.nav-item'); if(!b) return;
    document.querySelectorAll('.nav-item').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');
  });
  /* sidebar collapse */
  document.getElementById('collapse').addEventListener('click',function(){
    document.getElementById('side').classList.toggle('collapsed');
  });
  /* composer */
  var input=document.getElementById('compIn');
  function autogrow(){input.style.height='36px';input.style.height=Math.min(input.scrollHeight,150)+'px';}
  input.addEventListener('input',autogrow);
  (function(){var b=document.getElementById('ratioBtn'),s=b.querySelector('span'),r=['1:1','4:5','3:2','16:9'],i=0;
    b.addEventListener('click',function(){i=(i+1)%r.length;s.textContent=r[i];});})();
  (function(){var v=document.getElementById('qVal'),n=1;function set(){v.textContent=n+'/3';}
    document.getElementById('qMinus').addEventListener('click',function(){if(n>1){n--;set();}});
    document.getElementById('qPlus').addEventListener('click',function(){if(n<3){n++;set();}});})();
  /* model picker */
  (function(){
    var btn=document.getElementById('autoBtn'),menu=document.getElementById('mpMenu'),
        label=document.getElementById('autoLabel'),list=document.getElementById('mpList'),search=document.getElementById('mpSearch');
    function filter(q){q=(q||'').toLowerCase();list.querySelectorAll('.mp-item').forEach(function(it){it.style.display=it.dataset.m.toLowerCase().indexOf(q)>=0?'':'none';});}
    function open(){menu.hidden=false;setTimeout(function(){if(search)search.focus();},10);}
    function close(){menu.hidden=true;if(search){search.value='';filter('');}}
    btn.addEventListener('click',function(e){e.stopPropagation();menu.hidden?open():close();});
    menu.addEventListener('click',function(e){e.stopPropagation();});
    document.addEventListener('click',function(){if(!menu.hidden)close();});
    list.addEventListener('click',function(e){var it=e.target.closest('.mp-item');if(!it)return;
      list.querySelectorAll('.mp-item').forEach(function(x){x.classList.remove('on');});it.classList.add('on');
      label.textContent=it.dataset.m;close();});
    if(search)search.addEventListener('input',function(){filter(this.value);});
  })();
  var gen=document.getElementById('genBig');
  function fire(){if(!input.value.trim()){input.focus();return;}gen.style.transform='scale(.97)';setTimeout(function(){gen.style.transform='';},150);input.value='';autogrow();}
  gen.addEventListener('click',fire);
  input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();fire();}});

  /* ===== mobile drawer: open/close the sidebar on phones ===== */
  (function(){
    var side=document.getElementById('side');
    var menuBtn=document.getElementById('menuBtn');
    var backdrop=document.getElementById('sideBackdrop');
    if(!side||!menuBtn) return;

    function openDrawer(){
      side.classList.add('open');
      if(backdrop) backdrop.classList.add('show');
    }
    function closeDrawer(){
      side.classList.remove('open');
      if(backdrop) backdrop.classList.remove('show');
    }

    menuBtn.addEventListener('click',function(e){
      e.stopPropagation();
      side.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    if(backdrop) backdrop.addEventListener('click',closeDrawer);

    /* tapping any nav link closes the drawer (links navigate to their pages) */
    side.querySelectorAll('.nav-item, .new-chat, .sb-user').forEach(function(el){
      el.addEventListener('click',closeDrawer);
    });

    /* if the window grows back to desktop, make sure the drawer is closed */
    window.addEventListener('resize',function(){
      if(window.innerWidth > 820) closeDrawer();
    });
  })();