export const CSS = `
:root {
  --color-ink: #111;
  --color-body: #222;
  --color-mid: #444;
  --color-muted: #666;
  --color-subtle: #888;
  --color-light: #999;
  --color-ghost: #ccc;
  --color-border: #e0e0e0;
  --color-divider: #eee;
  --color-surface: #fafafa;
  --color-page: #fff;
  --color-accent: #444;
  --color-link: #222;

  --color-status-active-bg: #e8ede9;  --color-status-active-text: #4a6b50;
  --color-status-planning-bg: #f2ece4; --color-status-planning-text: #7a6840;
  --color-status-paused-bg: #ececec;   --color-status-paused-text: #777;
  --color-status-done-bg: #e8edf2;     --color-status-done-text: #4a5f6b;
  --color-status-archived-bg: #ececec; --color-status-archived-text: #777;

  --color-cat-dev: #94a89b;   --color-cat-bemodi: #c4a0a0;
  --color-cat-ifp-labs: #a0afc4; --color-cat-musik: #b0a0c4;
  --color-cat-privat: #aaa;

  /* Node type colors */
  --color-type-concept: #4a7a9b;
  --color-type-fact: #7a4a9b;
  --color-type-decision: #9b7a4a;
  --color-type-template: #4a9b7a;
  --color-type-secret: #9b4a4a;
  --color-type-config: #6b7a9b;

  --font-sans: -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji";
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", monospace;
  --font-active: var(--font-sans);
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-size: 16px; }
body {
  font-family: var(--font-active);
  background: var(--color-page);
  color: var(--color-body);
  line-height: 1.6;
  font-size: 1rem;
}
a { color: var(--color-link); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 1632px; margin: 0 auto; padding: 1.85rem 2.5rem; background: color-mix(in srgb, var(--color-page) 92%, transparent); border-radius: 0 0 0.46rem 0.46rem; min-height: calc(100vh - 3rem); }

/* Navigation */
nav {
  background: var(--color-page);
  border-bottom: 1px solid var(--color-border);
  padding: 0.77rem 1.85rem;
  display: flex; gap: 0.3rem; align-items: center;
  position: sticky; top: 0; z-index: 40;
}
nav .brand {
  font-family: var(--font-mono);
  font-size: 1.08rem; font-weight: 700;
  color: var(--color-ink); margin-right: 1.23rem;
  letter-spacing: -0.02em;
}
nav a {
  color: var(--color-subtle);
  font-size: 0.85rem; font-weight: 500;
  padding: 0.31rem 0.54rem; border-radius: 0.46rem;
  transition: all 0.12s;
}
nav a:hover { color: var(--color-body); background: var(--color-surface); text-decoration: none; }
nav a.active { color: var(--color-ink); background: var(--color-surface); }

/* Stats Bar */
.stats-bar {
  display: flex; gap: 1.54rem; padding: 1.08rem 0;
  font-size: 0.85rem; color: var(--color-muted); font-weight: 500;
}
.stats-bar strong {
  font-family: var(--font-mono); color: var(--color-ink);
  font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em;
}

/* Grid */
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1.85rem; margin-top: 1.23rem; }

/* Cards */
.card {
  background: var(--color-page); border: 1px solid var(--color-border);
  border-radius: 0.46rem; padding: 0.92rem 1.23rem;
  margin-bottom: 0.62rem; transition: background 0.12s;
}
.card:hover { background: var(--color-surface); }
.card h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.15rem; color: var(--color-ink); }
.card p { font-size: 0.92rem; color: var(--color-muted); }

/* Badges */
.badge {
  font-size: 0.77rem; font-weight: 600;
  padding: 0.23rem 0.69rem; border-radius: 0.46rem;
  display: inline-block; letter-spacing: 0.04em;
}
.badge-dev { background: #e8ede9; color: #4a6b50; }
.badge-bemodi { background: #f0e8e8; color: #6b4a4a; }
.badge-ifp-labs { background: #e8edf2; color: #4a5f6b; }
.badge-musik { background: #ece8f2; color: #5f4a6b; }
.badge-privat { background: #ececec; color: #666; }
.badge-status { font-size: 0.77rem; padding: 0.23rem 0.69rem; border-radius: 0.46rem; margin-left: 0.46rem; }
.badge-active { background: var(--color-status-active-bg); color: var(--color-status-active-text); }
.badge-planning { background: var(--color-status-planning-bg); color: var(--color-status-planning-text); }
.badge-paused { background: var(--color-status-paused-bg); color: var(--color-status-paused-text); }
.badge-done { background: var(--color-status-done-bg); color: var(--color-status-done-text); }
.badge-archived { background: var(--color-status-archived-bg); color: var(--color-status-archived-text); }
.badge-draft { background: #f2ece4; color: #7a6840; }
.badge-deprecated { background: #ececec; color: #777; }

/* Node type badges */
.badge-concept { background: #e4edf5; color: #2a5a7a; }
.badge-fact { background: #ede4f5; color: #5a2a7a; }
.badge-decision { background: #f5ede4; color: #7a5a2a; }
.badge-template { background: #e4f5ed; color: #2a7a5a; }
.badge-secret { background: #f5e4e4; color: #7a2a2a; }
.badge-config { background: #e8ecf5; color: #3a4a6a; }

/* Tags */
.tag {
  font-size: 0.69rem; background: var(--color-surface); color: var(--color-muted);
  border: 1px solid var(--color-border); border-radius: 0.31rem;
  padding: 0.1rem 0.46rem; display: inline-block;
}

/* Progress */
.progress { width: 100%; height: 3px; background: var(--color-divider); border-radius: 2px; margin-top: 0.62rem; overflow: hidden; }
.progress-bar { height: 100%; background: var(--color-cat-dev); border-radius: 2px; transition: width 0.3s; }

/* Activity List */
.activity-list { list-style: none; }
.activity-list li { padding: 0.46rem 0; border-bottom: 1px solid var(--color-divider); font-size: 0.92rem; color: var(--color-muted); }
.activity-list time { font-family: var(--font-mono); font-size: 0.77rem; color: var(--color-light); margin-right: 0.62rem; }

/* Headings */
h1 { font-weight: 700; color: var(--color-ink); letter-spacing: -0.02em; }
h2 { font-size: 0.69rem; font-weight: 700; margin-bottom: 0.77rem; color: var(--color-subtle); text-transform: uppercase; letter-spacing: 0.1em; }

/* Login */
.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--color-surface); }
.login-box { background: var(--color-page); border: 1px solid var(--color-border); padding: 2.46rem; border-radius: 0.62rem; width: 100%; max-width: 340px; box-shadow: 0 12px 32px rgba(0,0,0,0.06); }
.login-box h1 { font-family: var(--font-mono); font-size: 1.38rem; text-align: center; margin-bottom: 1.85rem; color: var(--color-ink); }
.login-box input { width: 100%; padding: 0.69rem 0.92rem; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 0.46rem; color: var(--color-body); font-family: var(--font-mono); font-size: 1rem; margin-bottom: 1.08rem; transition: border-color 0.12s; }
.login-box input:focus { outline: none; border-color: var(--color-mid); }
.login-box button { width: 100%; padding: 0.69rem 0.92rem; background: var(--color-ink); color: var(--color-page); border: none; border-radius: 0.46rem; font-weight: 600; cursor: pointer; font-size: 0.92rem; transition: background 0.12s; }
.login-box button:hover { background: var(--color-body); }
.login-box .error { color: #904040; font-size: 0.92rem; margin-bottom: 0.62rem; text-align: center; background: #fdf5f5; padding: 0.46rem; border-radius: 0.46rem; border: 1px solid #c08080; }

/* Empty state */
.empty { color: var(--color-light); font-size: 0.92rem; padding: 1.23rem 0; }

/* Table */
table { width: 100%; border-collapse: collapse; }
thead tr { border-bottom: 1px solid var(--color-border); }
th { padding: 0.62rem; font-size: 0.69rem; font-weight: 700; color: var(--color-subtle); text-align: left; text-transform: uppercase; letter-spacing: 0.1em; }
tbody tr { border-bottom: 1px solid var(--color-divider); transition: background 0.1s; }
tbody tr:hover { background: var(--color-surface); }
td { padding: 0.77rem 0.62rem; font-size: 1rem; }

/* Table wrapper for horizontal scroll on mobile */
.table-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-ghost); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-subtle); }

/* Description truncation */
.truncate-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }


/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-ghost); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-subtle); }

/* Filter bar */
.filter-bar { display: flex; gap: 0.46rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
.filter-bar select {
  padding: 0.31rem 0.62rem; font-size: 0.85rem; border: 1px solid var(--color-border);
  border-radius: 0.46rem; background: var(--color-page); color: var(--color-body);
  cursor: pointer; font-family: var(--font-active);
}
.filter-bar select:focus { outline: none; border-color: var(--color-mid); }

/* Pagination */
.pagination { display: flex; align-items: center; gap: 0.77rem; padding: 1.23rem 0; font-size: 0.85rem; color: var(--color-muted); }
.pagination a { padding: 0.31rem 0.77rem; border: 1px solid var(--color-border); border-radius: 0.46rem; color: var(--color-body); }
.pagination a:hover { background: var(--color-surface); text-decoration: none; }
.pagination .current { font-family: var(--font-mono); font-weight: 600; color: var(--color-ink); }

/* Markdown content rendering */
.markdown-content h1 { font-size: 1.54rem; font-weight: 700; color: var(--color-ink); margin-top: 2rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--color-border); }
.markdown-content h2 { font-size: 1.23rem; font-weight: 600; color: var(--color-ink); margin-top: 1.85rem; padding-bottom: 0.38rem; border-bottom: 1px solid var(--color-border); text-transform: none; letter-spacing: normal; }
.markdown-content h3 { font-size: 1.08rem; font-weight: 600; color: var(--color-ink); margin-top: 1.23rem; text-transform: none; letter-spacing: normal; }
.markdown-content h1:first-child, .markdown-content h2:first-child, .markdown-content h3:first-child { margin-top: 0; }
.markdown-content p { font-size: 1.08rem; line-height: 1.7; margin-bottom: 0.92rem; color: var(--color-body); }
.markdown-content ul, .markdown-content ol { font-size: 1.08rem; padding-left: 1.85rem; margin-bottom: 0.92rem; }
.markdown-content li { margin-bottom: 0.31rem; line-height: 1.6; }
.markdown-content blockquote { border-left: 3px solid var(--color-muted); background: var(--color-surface); padding: 0.62rem 1.23rem; border-radius: 0.31rem; margin: 1rem 0; }
.markdown-content blockquote p { margin-bottom: 0.31rem; color: var(--color-mid); }
.markdown-content code { font-family: var(--font-mono); font-size: 0.85em; background: var(--color-surface); padding: 0.15rem 0.46rem; border-radius: 0.23rem; border: 1px solid var(--color-border); }
.markdown-content pre code { background: none; border: none; padding: 0; font-size: 0.92rem; }
.markdown-content pre { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.46rem; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
.markdown-content table { margin: 1rem 0; }
.markdown-content thead tr { border-bottom: 2px solid var(--color-border); }
.markdown-content th { background: var(--color-surface); padding: 0.62rem 0.92rem; }
.markdown-content td { padding: 0.62rem 0.92rem; border-bottom: 1px solid var(--color-border); }
.markdown-content tbody tr:hover { background: var(--color-surface); }
.markdown-content a { color: var(--color-link); text-decoration: underline; }

/* highlight.js token colors — light theme */
.hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #6f42a0; }
.hljs-title, .hljs-section, .hljs-title.function_ { color: #2a5ea8; }
.hljs-string, .hljs-attr { color: #4e7a00; }
.hljs-number, .hljs-literal { color: #c45d10; }
.hljs-comment { color: #808080; font-style: italic; }
.hljs-type, .hljs-params { color: #a02020; }
.hljs-meta { color: #666; }
.hljs-property { color: #2a5ea8; }
.hljs-punctuation { color: #555; }

/* Dark Theme */
[data-theme="dark"] {
  --color-ink: #eee; --color-body: #ddd; --color-mid: #bbb;
  --color-muted: #999; --color-subtle: #888; --color-light: #777;
  --color-ghost: #555; --color-border: #383838; --color-divider: #2a2a2a;
  --color-surface: #1e1e1e; --color-page: #161616;
  --color-accent: #bbb; --color-link: #ddd;
  --color-status-active-bg: #1e2a20; --color-status-active-text: #7aab80;
  --color-status-planning-bg: #2a2618; --color-status-planning-text: #d0b070;
  --color-status-paused-bg: #222; --color-status-paused-text: #888;
  --color-status-done-bg: #1e2228; --color-status-done-text: #7a9ab0;
  --color-status-archived-bg: #222; --color-status-archived-text: #888;
  --color-cat-dev: #7a9480; --color-cat-bemodi: #a08080;
  --color-cat-ifp-labs: #8090a0; --color-cat-musik: #9080a0; --color-cat-privat: #808080;
}
[data-theme="dark"] .badge-dev { background: #1e2a20; color: #7aab80; }
[data-theme="dark"] .badge-bemodi { background: #281e1e; color: #b08080; }
[data-theme="dark"] .badge-ifp-labs { background: #1e2228; color: #8090a0; }
[data-theme="dark"] .badge-musik { background: #221e28; color: #9080a0; }
[data-theme="dark"] .badge-privat { background: #222; color: #808080; }
[data-theme="dark"] .badge-concept { background: #1e2a38; color: #7aaac8; }
[data-theme="dark"] .badge-fact { background: #281e38; color: #a87ac8; }
[data-theme="dark"] .badge-decision { background: #382e1e; color: #c8a87a; }
[data-theme="dark"] .badge-template { background: #1e3828; color: #7ac8a8; }
[data-theme="dark"] .badge-secret { background: #381e1e; color: #c87a7a; }
[data-theme="dark"] .badge-config { background: #222838; color: #7a8ab0; }
[data-theme="dark"] .login-box .error { background: #2a1e1e; color: #d09090; border-color: #804040; }
[data-theme="dark"] .login-page { background: var(--color-page); }
[data-theme="dark"] .login-box { box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
[data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea { color-scheme: dark; }

[data-theme="dark"] .tag { border-color: var(--color-border); }

/* highlight.js dark theme */
[data-theme="dark"] .hljs-keyword, [data-theme="dark"] .hljs-selector-tag, [data-theme="dark"] .hljs-built_in { color: #c586c0; }
[data-theme="dark"] .hljs-title, [data-theme="dark"] .hljs-section, [data-theme="dark"] .hljs-title.function_ { color: #dcdcaa; }
[data-theme="dark"] .hljs-string, [data-theme="dark"] .hljs-attr { color: #ce9178; }
[data-theme="dark"] .hljs-number, [data-theme="dark"] .hljs-literal { color: #b5cea8; }
[data-theme="dark"] .hljs-comment { color: #6a9955; font-style: italic; }
[data-theme="dark"] .hljs-type, [data-theme="dark"] .hljs-params { color: #4ec9b0; }
[data-theme="dark"] .hljs-property { color: #9cdcfe; }

/* Controls */
.controls { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.ctrl-group { display: flex; gap: 2px; margin-right: 8px; }
.ctrl-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; border: 1px solid var(--color-border);
  background: none; color: var(--color-subtle);
  cursor: pointer; transition: all 0.12s;
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
}
.ctrl-btn:hover { color: var(--color-body); border-color: var(--color-ghost); }
.ctrl-btn.active { background: var(--color-ink); color: var(--color-page); border-color: var(--color-ink); }
.ctrl-btn svg { width: 14px; height: 14px; }
/* Hamburger menu button - hidden on desktop */
.nav-toggle {
  display: none; width: 28px; height: 28px;
  align-items: center; justify-content: center;
  border-radius: 6px; border: 1px solid var(--color-border);
  background: none; color: var(--color-subtle);
  cursor: pointer; margin-left: auto; font-size: 16px; line-height: 1;
}
.nav-links { display: contents; }

/* ---- Mobile Responsive ---- */
@media (max-width: 640px) {
  nav {
    flex-wrap: wrap;
    padding: 0.62rem 1rem;
    gap: 0;
  }
  .nav-toggle { display: flex; }
  .nav-links {
    display: none;
    width: 100%;
    flex-direction: column;
    gap: 2px;
    padding-top: 0.5rem;
  }
  .nav-links.open { display: flex; }
  nav a:not(.brand) {
    padding: 0.46rem 0.62rem;
    font-size: 0.85rem;
  }
  nav .brand { margin-right: auto; }

  .controls {
    width: 100%;
    justify-content: flex-end;
    padding-top: 0.38rem;
    margin-left: 0;
  }
  .ctrl-group { display: none; }

  .container { padding: 1rem 0.77rem; }
  .stats-bar { flex-wrap: wrap; gap: 0.77rem; }
  .grid { grid-template-columns: 1fr; gap: 1.23rem; }
  table { min-width: 540px; }
  .login-box { width: 100%; max-width: 100%; margin: 0 1rem; padding: 1.85rem 1.23rem; }
  .login-page { padding: 1rem; }
  .card { padding: 0.77rem 0.92rem; }
  h1 { font-size: 1.15rem; }
}

/* Search Trigger */
.search-trigger {
  display: flex; align-items: center; gap: 8px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 0.46rem; padding: 4px 12px; cursor: pointer; margin-right: auto;
}
.search-trigger:hover { border-color: var(--color-ghost); }

/* Command Palette */
.cmd-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 15vh; z-index: 100;
}
.cmd-box {
  background: var(--color-page); border: 1px solid var(--color-border);
  border-radius: 0.62rem; width: 100%; max-width: 560px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.15); overflow: hidden;
}
.cmd-box input {
  width: 100%; padding: 14px 18px; background: transparent;
  border: none; border-bottom: 1px solid var(--color-border);
  font-size: 1rem; color: var(--color-body); font-family: var(--font-active); outline: none;
}
.cmd-results { max-height: 320px; overflow-y: auto; }
.cmd-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 18px; cursor: pointer; text-decoration: none; color: inherit;
  border-bottom: 1px solid var(--color-divider);
}
.cmd-item:hover, .cmd-selected { background: var(--color-surface); text-decoration: none; }
.cmd-icon { font-size: 1rem; width: 24px; text-align: center; }
.cmd-title { flex: 1; font-size: 0.92rem; color: var(--color-body); }
.cmd-ctx { font-size: 0.77rem; color: var(--color-subtle); }
.cmd-type { font-size: 0.62rem; font-family: var(--font-mono); color: var(--color-light); text-transform: uppercase; }
.cmd-empty { padding: 20px; text-align: center; color: var(--color-subtle); font-size: 0.92rem; }

[data-theme="dark"] .cmd-overlay { background: rgba(0,0,0,0.6); }
[data-theme="dark"] .cmd-box { box-shadow: 0 16px 48px rgba(0,0,0,0.4); }

@media (max-width: 640px) {
  .search-trigger kbd { display: none; }
  .search-trigger { padding: 6px 10px; }
  .cmd-overlay { padding-top: 0; }
  .cmd-box { max-width: 100%; border-radius: 0; min-height: 100vh; }
}

/* Bento Grid */
.bento-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1.85rem; margin-top: 1.23rem; }
.bento-projects { display: flex; flex-direction: column; gap: 0.46rem; }
.bento-tile {
  background: var(--color-page); border: 1px solid var(--color-border);
  border-radius: 0.46rem; padding: 0.77rem 1rem; transition: background 0.12s;
}
.bento-tile:hover { background: var(--color-surface); }
.bento-sidebar { display: flex; flex-direction: column; gap: 1.23rem; }

/* Attention List */
.attention-list { font-size: 0.85rem; }
.attention-header {
  font-weight: 700; font-size: 0.69rem; text-transform: uppercase;
  letter-spacing: 0.5px; margin-bottom: 8px;
}
.attention-red { color: #904040; }
.attention-green { color: #4a7a4a; }
.attention-item {
  padding: 8px 12px; border-bottom: 1px solid var(--color-divider);
  display: flex; align-items: center; gap: 10px;
}
.attention-item-red { border-left: 3px solid #c08080; background: color-mix(in srgb, #c08080 5%, transparent); }
.attention-item-yellow { border-left: 3px solid #c4b080; }
.attention-label {
  font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700;
  text-transform: uppercase; width: 70px; flex-shrink: 0;
}
.attention-title { flex: 1; color: var(--color-body); }
.attention-meta { font-size: 0.69rem; color: var(--color-subtle); }

/* Hub Layout */
.hub-layout { display: flex; gap: 0; min-height: 400px; border: 1px solid var(--color-border); border-radius: 0.46rem; overflow: hidden; }
.hub-sidebar {
  width: 28%; min-width: 220px; max-width: 400px; flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  padding: 12px; font-size: 0.77rem; overflow-y: auto; background: var(--color-surface);
}
.hub-content { flex: 1; padding: 20px; overflow-y: auto; }
.hub-header {
  display: flex; align-items: center; gap: 1.23rem;
  padding-bottom: 16px; border-bottom: 1px solid var(--color-border); margin-bottom: 16px;
}
.sidebar-section { margin-bottom: 14px; }
.sidebar-header {
  font-weight: 700; text-transform: uppercase; font-size: 0.62rem;
  letter-spacing: 1px; color: var(--color-subtle); margin-bottom: 6px;
}
.sidebar-count { font-weight: 400; color: var(--color-light); }
.sidebar-link {
  display: block; padding: 4px 8px; color: var(--color-muted);
  font-size: 0.77rem; border-radius: 4px; cursor: pointer; text-decoration: none;
  line-height: 1.4;
}
.sidebar-link:hover { background: var(--color-page); color: var(--color-ink); text-decoration: none; }
.sidebar-active { background: var(--color-page); color: var(--color-ink) !important; }

/* Mobile Hub */
.hub-tabs { display: none; }
@media (max-width: 640px) {
  .hub-sidebar { display: none; }
  .hub-layout { flex-direction: column; }
  .hub-content { padding: 12px; }
  .hub-header { flex-direction: column; text-align: center; gap: 12px; }
  .hub-tabs {
    display: flex; gap: 0; overflow-x: auto; -webkit-overflow-scrolling: touch;
    border-bottom: 1px solid var(--color-border); margin-bottom: 12px;
  }
  .hub-tab {
    flex: none; padding: 8px 16px; font-size: 0.77rem; font-weight: 600;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--color-subtle); cursor: pointer; white-space: nowrap;
  }
  .hub-tab-active { color: var(--color-ink); border-bottom-color: var(--color-ink); }
  .bento-grid { grid-template-columns: 1fr; }
}

/* Node Browser */
.node-card {
  background: var(--color-page); border: 1px solid var(--color-border);
  border-radius: 0.46rem; padding: 0.92rem 1.23rem;
  margin-bottom: 0.62rem; transition: background 0.12s; display: block;
  text-decoration: none; color: inherit;
}
.node-card:hover { background: var(--color-surface); text-decoration: none; }
.node-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.node-card-title { font-size: 0.92rem; font-weight: 600; color: var(--color-ink); flex: 1; }
.node-card-meta { font-size: 0.77rem; color: var(--color-light); font-family: var(--font-mono); }
.node-card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }

/* Node detail */
.node-detail-header { margin-bottom: 1.23rem; }
.breadcrumb { font-size: 0.77rem; color: var(--color-subtle); margin-bottom: 0.62rem; }
.breadcrumb a { color: var(--color-subtle); }
.breadcrumb a:hover { color: var(--color-body); }
.node-detail-title { font-size: 1.54rem; font-weight: 700; color: var(--color-ink); margin-bottom: 0.62rem; }
.node-detail-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 1.23rem; }
.connections-section { margin-top: 2rem; padding-top: 1.23rem; border-top: 1px solid var(--color-border); }
.connection-item { padding: 0.46rem 0; border-bottom: 1px solid var(--color-divider); display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.connection-relation { font-family: var(--font-mono); font-size: 0.69rem; color: var(--color-subtle); text-transform: uppercase; min-width: 80px; }

/* Ecosystem Graph */
.ecosystem-graph {
  width: 100%; height: calc(100vh - 140px);
  background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: 0.46rem; overflow: hidden;
}
.graph-tooltip {
  position: absolute; background: var(--color-page);
  border: 1px solid var(--color-border); border-radius: 0.46rem;
  padding: 8px 12px; font-size: 0.77rem; color: var(--color-body);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 50;
  pointer-events: none; max-width: 240px;
}
[data-theme="dark"] .graph-tooltip { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
`;
