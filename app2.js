import express from 'express';
import iconv from 'iconv-lite';

const app = express();
const PORT = 3000;
const BASE = 'http://lib.ru';
app.use(express.static('public'));

app.use(async (req, res) => {
  try {
    // игнорируем мусор браузера
    if (
      req.originalUrl === '/favicon.ico' ||
      req.originalUrl.startsWith('/.well-known')
    ) {
      return res.status(204).end();
    }
if (req.originalUrl.endsWith('.txt') || req.originalUrl.endsWith('.shtml')) {
  console.log('📘 BOOK PAGE:', req.originalUrl);
} else {
  console.log('📂 CATALOG PAGE:', req.originalUrl);
}

    const targetUrl = BASE + req.originalUrl;
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

    const buffer = Buffer.from(await response.arrayBuffer());

    // если не HTML — просто отдаём как есть
    if (!contentType.includes('text/html')) {
      res.setHeader('content-type', contentType);
      return res.send(buffer);
    }

    // HTML (lib.ru → windows-1251)
let encoding = 'windows-1251';

if (contentType.includes('koi8-r')) encoding = 'koi8-r';
if (contentType.includes('utf-8')) encoding = 'utf-8';

// const html = iconv.decode(buffer, encoding);
// if (
//   !req.originalUrl.endsWith('/') ||
//   req.originalUrl.endsWith('.txt') ||
//   req.originalUrl.endsWith('.shtml')
// ) {
//   // не каталог автора — просто отдаем html
//   return res.send(html);
// }const bookLinks = [];
// const regex = /href\s*=\s*"?([^"\s>]+?\.(?:txt|shtml))"?/gi;


// let match;
// while ((match = regex.exec(html)) !== null) {
//   bookLinks.push(match[1]);
// }

// console.log('📚 books found:', bookLinks.length);
// console.log(bookLinks.slice(0, 10));


// console.log('encoding used:', encoding);

//     console.log('html head:', html.slice(0, 120));

//     // убираем CSP, чтобы браузер не блокировал
//     res.setHeader(
//       'Content-Security-Policy',
//       "default-src * 'unsafe-inline' 'unsafe-eval' data: blob;"
//     );
// const rewritten = html.replaceAll(
//   'href="',
//   'href="'
// );

//     res.send(rewritten);
  } catch (e) {
    console.error('proxy error:', e);
    res.status(500).send('proxyError');
  }
});

app.listen(PORT, () => {
  console.log(`running at port ${PORT}`);
});
