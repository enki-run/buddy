import { marked } from "marked";
import hljs from "highlight.js";

// Configure marked with highlight.js for syntax highlighting
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value;
        return `<pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>`;
      }
      const highlighted = hljs.highlightAuto(text).value;
      return `<pre><code class="hljs">${highlighted}</code></pre>`;
    },
  },
});

// Allowed HTML tags in rendered markdown (allowlist approach)
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "em", "b", "i", "u", "s", "del",
  "blockquote", "pre", "code",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "a", "img", "span",
  "div", "sup", "sub",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title"]),
  code: new Set(["class"]),
  span: new Set(["class"]),
  pre: new Set(["class"]),
  td: new Set(["align"]),
  th: new Set(["align"]),
};

/**
 * Strip disallowed HTML tags and attributes from rendered markdown.
 * Lightweight alternative to sanitize-html (which requires postcss/fs and is not Workers-compatible).
 */
function sanitize(html: string): string {
  // Remove script/style tags and their content entirely
  let clean = html.replace(/<(script|style|iframe|object|embed|form|input|textarea|button)[^>]*>[\s\S]*?<\/\1>/gi, "");
  clean = clean.replace(/<(script|style|iframe|object|embed|form|input|textarea|button)[^>]*\/?>/gi, "");

  // Remove event handler attributes (onclick, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // Remove javascript: and data: URLs in href/src (except data:image)
  clean = clean.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
  clean = clean.replace(/src\s*=\s*["']?\s*javascript:/gi, 'src="');

  // Strip disallowed tags but keep content
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return ""; // strip tag entirely

    // For allowed tags, strip disallowed attributes
    if (match.startsWith("</")) return `</${lower}>`; // closing tag, no attrs

    const allowed = ALLOWED_ATTRS[lower];
    if (!allowed) {
      // Tag allowed but no attributes permitted (except class on code/span/pre)
      return match.replace(/\s+[a-zA-Z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, "");
    }

    // Keep only allowed attributes
    const stripped = match.replace(/\s+([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, (_m, attr, val) => {
      if (allowed.has(attr.toLowerCase())) return ` ${attr.toLowerCase()}=${val}`;
      return "";
    });
    return stripped;
  });

  return clean;
}

export function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  return sanitize(html);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
