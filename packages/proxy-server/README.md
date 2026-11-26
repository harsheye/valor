# `@valor/proxy-server`

Installable media proxy server for **Valor Embed Player** that bypasses CORS, forwards `Range` headers for instant seeking, rewrites `.m3u8` HLS playlists & segments automatically, and injects custom request headers (`Authorization`, `Referer`, `Cookie`, etc.).

## 1. Run Standalone CLI

```bash
npx @valor/proxy-server --port 8787
# Proxy endpoint: http://localhost:8787/proxy
```

## 2. Install in Your Node / Express / Next.js App

```js
import express from 'express';
import { createValorProxyHandler } from '@valor/proxy-server';

const app = express();
app.use('/api/media-proxy', createValorProxyHandler({
  mountPath: '/api/media-proxy',
  defaultHeaders: { Referer: 'https://example.com/' },
}));
app.listen(3000);
```

## 3. Pass Proxy to Valor Embed Player

```ts
import { MediaPlayer } from '@valor/embed-sdk';

const player = new MediaPlayer({
  container: '#player',
  media: 'https://restricted-cdn.example.com/master.m3u8',
  proxyUrl: 'http://localhost:8787/proxy',
  headers: { Authorization: 'Bearer <token>' },
});
```

Or with `<valor-player>`:

```html
<valor-player
  src="https://restricted-cdn.example.com/master.m3u8"
  proxy="http://localhost:8787/proxy"
  headers='{"Authorization": "Bearer <token>"}'
  controls>
</valor-player>
```
