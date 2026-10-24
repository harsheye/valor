/**
 * Valor Local Media Companion Service Client
 * 
 * Detects whether the user is running the local companion service (port 45454).
 * If running, routes heavy remote media downloads, block caching, probe requests,
 * and audio/subtitle transcoding directly through the user's local machine,
 * taking the bandwidth and processing load off the central server.
 */

export interface SidecarStatus {
  isAvailable: boolean;
  checking: boolean;
  port: number;
  version?: string;
  uptimeSeconds?: number;
  cacheBlocks?: number;
  cacheSizeBytes?: number;
  latencyMs?: number;
  lastChecked: number;
  error?: string;
}

type SidecarListener = (status: SidecarStatus) => void;

class SidecarService {
  private static instance: SidecarService;
  private port = 45454;
  private listeners: Set<SidecarListener> = new Set();
  private pollTimer: any = null;
  private status: SidecarStatus = {
    isAvailable: false,
    checking: false,
    port: 45454,
    lastChecked: 0
  };

  private constructor() {
    // Initial silent check
    if (typeof window !== 'undefined') {
      setTimeout(() => this.checkHealth(), 500);
      this.startPolling();

      window.addEventListener('focus', () => {
        this.checkHealth();
      });
    }
  }

  public static getInstance(): SidecarService {
    if (!SidecarService.instance) {
      SidecarService.instance = new SidecarService();
    }
    return SidecarService.instance;
  }

  public getStatus(): SidecarStatus {
    return { ...this.status };
  }

  public isEnabled(): boolean {
    return this.status.isAvailable;
  }

  public subscribe(listener: SidecarListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getStatus();
    this.listeners.forEach(fn => {
      try {
        fn(s);
      } catch (err) {
        console.error('[SidecarService] listener error:', err);
      }
    });
  }

  /**
   * Ping local daemon at http://127.0.0.1:45454/api/sidecar/status
   */
  public async checkHealth(): Promise<boolean> {
    if (this.status.checking) return this.status.isAvailable;
    
    this.status.checking = true;
    this.notify();

    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(`http://127.0.0.1:${this.port}/api/sidecar/status`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        mode: 'cors'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const latency = Math.round(performance.now() - t0);
        this.status = {
          isAvailable: true,
          checking: false,
          port: this.port,
          version: data.version || '1.0.0',
          uptimeSeconds: data.uptimeSeconds,
          cacheBlocks: data.cacheBlocks,
          cacheSizeBytes: data.cacheSizeBytes,
          latencyMs: latency,
          lastChecked: Date.now()
        };
        this.notify();
        return true;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      this.status = {
        isAvailable: false,
        checking: false,
        port: this.port,
        lastChecked: Date.now(),
        error: err?.message || 'Connection failed'
      };
      this.notify();
      return false;
    }
  }

  public startPolling(intervalMs: number = 10000) {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.checkHealth();
    }, intervalMs);
  }

  public stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Returns base URL for remote operations.
   * If companion is available: 'http://127.0.0.1:45454'
   * Otherwise: '' (relative to current server origin)
   */
  public getRemoteApiBase(): string {
    if (this.status.isAvailable) {
      return `http://127.0.0.1:${this.port}`;
    }
    return '';
  }

  /**
   * Helper to build a proxy media URL using either local companion or server
   */
  public resolveProxyMediaUrl(remoteUrl: string, options?: { duration?: number; sessionId?: string; user?: string; pass?: string }): string {
    const base = this.getRemoteApiBase();
    const query = new URLSearchParams({ url: remoteUrl });
    if (options?.duration) query.set('duration', options.duration.toString());
    if (options?.sessionId) query.set('sessionId', options.sessionId);
    if (options?.user) query.set('user', options.user);
    if (options?.pass) query.set('pass', options.pass);
    return `${base}/api/proxy-media?${query.toString()}`;
  }

  /**
   * Helper to build a subtitle packet URL
   */
  public resolveSubtitlePacketUrl(params: { url: string; streamIndex: number; startTime?: number; duration?: number; deviceId?: string }): string {
    const base = this.getRemoteApiBase();
    const query = new URLSearchParams({
      url: params.url,
      streamIndex: params.streamIndex.toString()
    });
    if (params.startTime !== undefined) query.set('startTime', params.startTime.toString());
    if (params.duration !== undefined) query.set('duration', params.duration.toString());
    return `${base}/api/remote/subtitle-packet?${query.toString()}`;
  }

  /**
   * Helper to build an audio packet URL
   */
  public resolveAudioPacketUrl(params: { url: string; streamIndex: number; startTime?: number; duration?: number; deviceId?: string }): string {
    const base = this.getRemoteApiBase();
    const query = new URLSearchParams({
      url: params.url,
      streamIndex: params.streamIndex.toString()
    });
    if (params.startTime !== undefined) query.set('startTime', params.startTime.toString());
    if (params.duration !== undefined) query.set('duration', params.duration.toString());
    return `${base}/api/remote/audio-packet?${query.toString()}`;
  }
}

export const sidecarService = SidecarService.getInstance();
