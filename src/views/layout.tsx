import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { CSS } from "../styles/tokens";

interface LayoutProps {
  title?: string;
  children: any;
  activePath?: string;
}

const HEAD_LINKS = raw('');

const INIT_SCRIPT = raw(`<script>
(function(){
  var t = localStorage.getItem('buddy-theme');
  if (!t) {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
  var z = parseInt(localStorage.getItem('buddy-zoom') || '2');
  document.documentElement.style.fontSize = [14, 16, 18][z] + 'px';
})();
</script>`);

const BODY_SCRIPT = raw(`<script>
(function(){
  window.toggleTheme = function() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('buddy-theme', next);
    var moonEl = document.getElementById('theme-moon');
    var sunEl = document.getElementById('theme-sun');
    if (moonEl) moonEl.style.display = next === 'dark' ? 'none' : 'block';
    if (sunEl) sunEl.style.display = next === 'dark' ? 'block' : 'none';
  };
  window.setZoom = function(level) {
    var sizes = [14, 16, 18];
    document.documentElement.style.fontSize = sizes[level] + 'px';
    localStorage.setItem('buddy-zoom', level.toString());
    document.querySelectorAll('.zoom-btn').forEach(function(btn, i) {
      btn.classList.toggle('active', i === level);
    });
  };
  // Init theme icons
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  var moonEl = document.getElementById('theme-moon');
  var sunEl = document.getElementById('theme-sun');
  if (moonEl) moonEl.style.display = currentTheme === 'dark' ? 'none' : 'block';
  if (sunEl) sunEl.style.display = currentTheme === 'dark' ? 'block' : 'none';
  // Init zoom buttons
  var z = localStorage.getItem('buddy-zoom') || '1';
  document.querySelectorAll('.zoom-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', i === parseInt(z));
  });
})();
</script>`);

const MOON_SVG = raw('<svg id="theme-moon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>');
const SUN_SVG = raw('<svg id="theme-sun" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>');

// Command Palette overlay
const PALETTE_HTML = raw(`<div id="cmd-palette" class="cmd-overlay" style="display:none" onclick="if(event.target===this)closePalette()">
  <div class="cmd-box">
    <input id="cmd-input" type="text" placeholder="Suchen..." autocomplete="off" oninput="onCmdInput(this.value)" onkeydown="onCmdKey(event)" />
    <div id="cmd-results" class="cmd-results"></div>
  </div>
</div>`);

const PALETTE_SCRIPT = raw(`<script>
(function(){
  var ICONS={node:'\u{1F9E0}',project:'\u{1F4C1}',task:'\u{1F4CB}'};
  var results=[];
  var sel=-1;
  var debTimer=null;

  function clearResults(){
    var box=document.getElementById('cmd-results');
    while(box.firstChild)box.removeChild(box.firstChild);
  }

  function moveSel(dir){
    var items=document.querySelectorAll('.cmd-item');
    if(!items.length)return;
    sel=Math.max(-1,Math.min(items.length-1,sel+dir));
    items.forEach(function(el,i){el.classList.toggle('cmd-selected',i===sel);});
    if(sel>=0)items[sel].scrollIntoView({block:'nearest'});
  }

  function urlFor(r){
    if(r.type==='project') return '/project/'+r.id;
    if(r.type==='task') return '/nodes'; // tasks don't have detail page
    return '/nodes/'+r.id; // all node:* types
  }

  function iconFor(r){
    if(r.type==='project') return '\u{1F4C1}';
    if(r.type==='task') return '\u{1F4CB}';
    return '\u{1F9E0}'; // node
  }

  function navigate(){
    if(sel>=0&&results[sel]){window.location.href=urlFor(results[sel]);}
  }

  function makeItem(r,i){
    var a=document.createElement('a');
    a.className='cmd-item';
    a.href=urlFor(r);

    var icon=document.createElement('span');
    icon.className='cmd-icon';
    icon.textContent=iconFor(r);
    a.appendChild(icon);

    var title=document.createElement('span');
    title.className='cmd-title';
    title.textContent=r.title;
    a.appendChild(title);

    if(r.context){
      var ctx=document.createElement('span');
      ctx.className='cmd-ctx';
      ctx.textContent=r.context;
      a.appendChild(ctx);
    }

    var type=document.createElement('span');
    type.className='cmd-type';
    type.textContent=r.type;
    a.appendChild(type);

    a.addEventListener('mouseenter',function(){
      sel=i;
      document.querySelectorAll('.cmd-item').forEach(function(e,j){
        e.classList.toggle('cmd-selected',j===i);
      });
    });
    return a;
  }

  function fetchResults(q){
    fetch('/api/search?q='+encodeURIComponent(q),{credentials:'same-origin'})
      .then(function(r){return r.json();})
      .then(function(data){
        results=data;sel=-1;
        clearResults();
        var box=document.getElementById('cmd-results');
        if(!data.length){
          var empty=document.createElement('div');
          empty.className='cmd-empty';
          empty.textContent='Keine Ergebnisse';
          box.appendChild(empty);
          return;
        }
        data.forEach(function(r,i){box.appendChild(makeItem(r,i));});
      })
      .catch(function(){});
  }

  window.openPalette=function(){
    document.getElementById('cmd-palette').style.display='flex';
    var inp=document.getElementById('cmd-input');
    inp.value='';
    inp.focus();
    results=[];sel=-1;
    clearResults();
  };
  window.closePalette=function(){
    document.getElementById('cmd-palette').style.display='none';
  };
  window.onCmdInput=function(val){
    clearTimeout(debTimer);
    if(!val.trim()){results=[];sel=-1;clearResults();return;}
    debTimer=setTimeout(function(){fetchResults(val);},200);
  };
  window.onCmdKey=function(e){
    if(e.key==='Escape'){closePalette();return;}
    if(e.key==='ArrowDown'){e.preventDefault();moveSel(1);return;}
    if(e.key==='ArrowUp'){e.preventDefault();moveSel(-1);return;}
    if(e.key==='Enter'){e.preventDefault();navigate();return;}
  };

  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){
      e.preventDefault();
      var pal=document.getElementById('cmd-palette');
      if(pal.style.display==='none'||!pal.style.display){openPalette();}else{closePalette();}
    }
  });
})();
</script>`);

export const Layout: FC<LayoutProps> = ({ title, children, activePath }) => {
  return (
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} — buddy` : "buddy"}</title>
        {raw('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'14\' fill=\'%23222\' stroke=\'%234a7a4a\' stroke-width=\'2\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' fill=\'%234a7a4a\' font-family=\'monospace\' font-size=\'18\' font-weight=\'700\'%3Eb%3C/text%3E%3C/svg%3E">')}
        {HEAD_LINKS}
        {raw(`<style>${CSS}</style>`)}
        {INIT_SCRIPT}
      </head>
      <body>
        <nav>
          <a href="/" class="brand">buddy</a>
          <button class="search-trigger" onclick="openPalette()" aria-label="Suche">
            <span style="font-size: 0.77rem; color: var(--color-subtle);">Suche...</span>
            <kbd style="font-family: var(--font-mono); font-size: 0.62rem; color: var(--color-light); background: var(--color-surface); padding: 2px 6px; border-radius: 3px; border: 1px solid var(--color-border);">&#8984;K</kbd>
          </button>
          <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Menu">
            {raw('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>')}
          </button>
          <div class="nav-links">
            <a href="/" class={activePath === "/" ? "active" : ""}>Home</a>
            <a href="/nodes" class={activePath === "/nodes" ? "active" : ""}>Nodes</a>
            <a href="/graph" class={activePath === "/graph" ? "active" : ""}>Graph</a>

            <a href="/activity" class={activePath === "/activity" ? "active" : ""}>Log</a>
            <div class="controls">
              <div class="ctrl-group">
                <button class="ctrl-btn zoom-btn" onclick="setZoom(0)" aria-label="Klein">S</button>
                <button class="ctrl-btn zoom-btn" onclick="setZoom(1)" aria-label="Mittel">M</button>
                <button class="ctrl-btn zoom-btn" onclick="setZoom(2)" aria-label="Gross">L</button>
              </div>
              <button class="ctrl-btn" onclick="toggleTheme()" aria-label="Theme wechseln">
                {MOON_SVG}
                {SUN_SVG}
              </button>
              <form method="post" action="/logout" style="display: inline; margin-left: 8px;">
                <button type="submit" class="ctrl-btn" aria-label="Logout" style="font-size: 9px; width: auto; padding: 0 8px;">Logout</button>
              </form>
            </div>
          </div>
        </nav>
        <div class="container">
          {children}
        </div>
        {BODY_SCRIPT}
        {PALETTE_HTML}
        {PALETTE_SCRIPT}
      </body>
    </html>
  );
};
