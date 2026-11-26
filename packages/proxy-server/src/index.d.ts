export interface ValorProxyOptions {
  /** Base path where the proxy is mounted (default: '/proxy') */
  mountPath?: string;
  /** Default headers to inject into every upstream request */
  defaultHeaders?: Record<string, string>;
  /** Allow proxying to private/loopback IPs (default: false) */
  allowPrivateIps?: boolean;
  /** Allowed CORS origins (default: '*') */
  corsOrigin?: string;
  /** Upstream request timeout in ms (default: 20000) */
  timeoutMs?: number;
}

export interface StartServerOptions extends ValorProxyOptions {
  port?: number;
  host?: string;
}

export function createValorProxyHandler(
  options?: ValorProxyOptions
): (req: any, res: any) => Promise<void>;

export function startValorProxyServer(
  options?: StartServerOptions
): Promise<{ server: any; port: number; host: string; url: string }>;
