#!/usr/bin/env node
import { startValorProxyServer } from '../src/index.mjs';

const args = process.argv.slice(2);
let port = Number(process.env.VALOR_PROXY_PORT || 8787);
let host = process.env.VALOR_PROXY_HOST || '0.0.0.0';
let allowPrivateIps = process.env.VALOR_PROXY_ALLOW_PRIVATE === 'true';

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
    port = Number(args[++i]);
  } else if ((args[i] === '--host' || args[i] === '-h') && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === '--allow-private') {
    allowPrivateIps = true;
  }
}

startValorProxyServer({ port, host, allowPrivateIps }).then(({ url }) => {
  console.log(`[Valor Proxy] Listening at ${url}`);
});
