import express from 'express';
import iconv from 'iconv-lite';
function stripLibRuDomain(html) {
  return html.replace(
    /(<a\s+[^>]*href\s*=\s*)(["']?)https?:\/\/(?:www\.)?(?:lit\.lib\.ru|lib\.ru|az\.lib\.ru)(\/[^"' >]*)\2/gi,
    (_, prefix, quote, path) => {
      const q = quote || '"';
      return `${prefix}${q}${path}${q}`;
    }
  );
}
function resolveBaseHost(path) {
  // 1️⃣ основные каталоги lib.ru
  if (
    path.startsWith('/PROZA') ||
    path.startsWith('/POEZIQ') ||
    path.startsWith('/INPROZ') ||
    path.startsWith('/RUSS_DETEKTIW') ||
    path.startsWith('/HISTORY') ||
    path.startsWith('/janr') ||
    path.startsWith('/type')
  ) {
    return 'http://lib.ru';
  }

  // 2️⃣ авторские разделы lit.lib.ru: /a/, /b/, /k/, ...
  if (/^\/[a-z]\//.test(path)) {
    return 'http://lit.lib.ru';
  }

  // 3️⃣ fallback
  return 'http://lib.ru';
}
function injectAuthorSearch(html) {
  const searchUI = `
<style>
#author-search {
  position: sticky;
  top: 0;
  z-index: 999;
  background: #fff;
  padding: 10px 12px;
  border-bottom: 1px solid #ddd;
  font-family: system-ui, Arial;
}
.author-hidden { display: none !important; }
</style>

<div id="author-search">
  <input
    id="authorInput"
    placeholder="Поиск автора…"
    style="width:100%;max-width:420px;padding:8px 10px;font-size:16px"
  />
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  console.log('[search] DOM ready');

  const input = document.getElementById('authorInput');
  if (!input) {
    console.log('[search] no input');
    return;
  }

  const items = Array.from(document.querySelectorAll('li'));
  console.log('[search] li count:', items.length);

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    console.log('[search] query:', q);

    let matched = 0;

    items.forEach(li => {
      const a = li.querySelector('a');
      if (!a) return;

      const text = a.textContent.toLowerCase();
      const ok = !q || text.includes(q);

      li.classList.toggle('author-hidden', !ok);
      if (ok) matched++;
    });

    console.log('[search] matched:', matched);
  });
});
</script>
    
`;

  return html.replace(/<body[^>]*>/i, m => m + searchUI);
}




const app = express();
const PORT = 3000;
const BASE = 'http://lib.ru';

// твои CSS / статика
app.use(express.static('public'));

app.use(async (req, res) => {
  try {
    // мусор браузера
    if (
      req.originalUrl === '/favicon.ico' ||
      req.originalUrl.startsWith('/.well-known')
    ) {
      return res.status(204).end();
    }

    const isBook =
      req.originalUrl.endsWith('.txt') ||
      req.originalUrl.endsWith('.shtml');

    console.log(isBook ? '📘 BOOK:' : '📂 CATALOG:', req.originalUrl);

    const base = resolveBaseHost(req.originalUrl);
    const targetUrl = base + req.originalUrl;
    console.log('🌐 base:', base);
    console.log('->', targetUrl);

    const start = Date.now();

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Connection': 'close',
      },
    });

    console.log('fetch time ms:', Date.now() - start);

    const contentType = response.headers.get('content-type') || '';
    console.log('status:', response.status);
    console.log('content-type:', contentType);

    const buffer = Buffer.from(await response.arrayBuffer());// не помню, для чего buffer

    // не HTML — отдаём как есть
    if (!contentType.includes('text/html')) {
      res.setHeader('content-type', contentType);
      return res.send(buffer);
    }

    // определяем кодировку
    let encoding = 'windows-1251';
    if (contentType.includes('koi8-r')) encoding = 'koi8-r';
    if (contentType.includes('utf-8')) encoding = 'utf-8';

    const html = iconv.decode(buffer, encoding);
    console.log('encoding:', encoding);

    // =========================
    // 📘 СТРАНИЦА КНИГИ → ЧИТАЛКА
    // =========================
    if (isBook) {
      const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      const raw = preMatch ? preMatch[1] : html;

      const text = raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\r\n/g, '\n')
        .trim();

      const title = decodeURIComponent(
        req.originalUrl.split('/').pop() || 'book'
      );

      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      return res.send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/reader.css" />
</head>
<body>
  <div class="topbar">
    <b>${title}</b>
    <span style="opacity:.6;margin-left:8px">${req.originalUrl}</span>
  </div>

  <main class="reader">
    <pre class="content" id="content"></pre>
  </main>

  <div class="pager">
    <button id="up">▲</button>
    <button id="down">▼</button>
  </div>

<script>
  const text = ${JSON.stringify(text)};
  const el = document.getElementById('content');
  el.textContent = text;

  const page = (d) =>
    window.scrollBy({ top: d * window.innerHeight * 0.9, behavior: 'smooth' });

  document.getElementById('down').onclick = () => page(1);
  document.getElementById('up').onclick = () => page(-1);

  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); page(1); }
    if (e.key === 'PageUp') { e.preventDefault(); page(-1); }
    if (e.key === 'Backspace') { e.preventDefault(); history.back(); }
  });
</script>
</body>
</html>`);
    }

// =========================
// 📂 КАТАЛОГ → ЧИНИМ ССЫЛКИ АККУРАТНО
// =========================
let fixedHtml = stripLibRuDomain(html);

if (
  req.originalUrl === '/PROZA/' ||
  req.originalUrl === '/POEZIQ/'
) {
  fixedHtml = injectAuthorSearch(fixedHtml);
}


res.setHeader(
  'Content-Security-Policy',
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob;"
);

return res.send(fixedHtml);


  } catch (e) {
    console.error('proxy error:', e);
    res.status(500).send('proxyError');
  }
});

app.listen(PORT, () => {
  console.log(`running at port ${PORT}`);
});
