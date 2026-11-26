import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export interface RealtimeEnvelope<T = any> {
  id: string;
  type: string;
  ts: string;
  actor: string;
  subject: string;
  data: T;
  v: number;
}

interface UseAdminRealtimeOptions {
  token: string | null;
  topics?: string[];
  onEvent?: (event: RealtimeEnvelope) => void;
  onBatchEvents?: (events: RealtimeEnvelope[]) => void;
  onSyncMissed?: (count: number) => void;
}

export function useAdminRealtime({
  token,
  topics = ['*'],
  onEvent,
  onBatchEvents,
  onSyncMissed
}: UseAdminRealtimeOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [nextRetrySeconds, setNextRetrySeconds] = useState<number>(0);
  const [missedEventsApplied, setMissedEventsApplied] = useState<number>(0);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [isCatchingUp, setIsCatchingUp] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const heartbeatWatchdogRef = useRef<any>(null);
  const slowPollTimerRef = useRef<any>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);
  const connectStreamRef = useRef<() => void>(() => {});

  // Keep latest callback references so callbacks changing don't trigger reconnect loops
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onBatchEventsRef = useRef(onBatchEvents);
  onBatchEventsRef.current = onBatchEvents;
  const onSyncMissedRef = useRef(onSyncMissed);
  onSyncMissedRef.current = onSyncMissed;

  // Normalized topics string key to prevent array identity change loops
  const topicsKey = useMemo(() => {
    return (topics || ['*']).slice().sort().join(',');
  }, [topics]);

  // Sync lastEventId ref
  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  // Heartbeat watchdog: if no activity for 40s, reconnect
  const resetHeartbeatWatchdog = useCallback(() => {
    if (heartbeatWatchdogRef.current) clearTimeout(heartbeatWatchdogRef.current);
    heartbeatWatchdogRef.current = setTimeout(() => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        handleConnectionFailure();
      }
    }, 40000);
  }, []);

  const handleConnectionFailure = useCallback(() => {
    setConnectionState('reconnecting');
    setReconnectAttempt(prev => {
      const nextAttempt = prev + 1;
      // Exponential backoff: minimum 2s, maximum 30s
      const delayMs = Math.min(2000 * Math.pow(1.5, Math.max(0, nextAttempt - 1)), 30000);
      const delaySec = Math.max(1, Math.round(delayMs / 1000));
      setNextRetrySeconds(delaySec);

      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      let remaining = delaySec;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setNextRetrySeconds(Math.max(remaining, 0));
        if (remaining <= 0 && countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      }, 1000);

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        connectStreamRef.current();
      }, delayMs);

      return nextAttempt;
    });
  }, []);

  const connectStream = useCallback(() => {
    if (!token) {
      setConnectionState('offline');
      return;
    }

    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }

    const currentLastId = lastEventIdRef.current;
    // Route via /api/admin/stream which matches the Vite /api proxy and backend router
    let url = `/api/admin/stream?topics=${encodeURIComponent(topicsKey)}&token=${encodeURIComponent(token)}`;
    if (currentLastId) {
      url += `&lastEventId=${encodeURIComponent(currentLastId)}`;
    }

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnectionState('live');
        setReconnectAttempt(0);
        setNextRetrySeconds(0);
        setIsCatchingUp(false);
        resetHeartbeatWatchdog();
      };

      // Heartbeat event
      es.addEventListener('heartbeat', () => {
        resetHeartbeatWatchdog();
      });

      // Sync replay event
      es.addEventListener('sync', (e: any) => {
        try {
          const syncData = JSON.parse(e.data);
          if (syncData.replayedCount > 0) {
            setMissedEventsApplied(syncData.replayedCount);
            if (onSyncMissedRef.current) onSyncMissedRef.current(syncData.replayedCount);
          }
        } catch {}
      });

      // Batched frames for high-volume events
      es.addEventListener('frame.batch', (e: any) => {
        resetHeartbeatWatchdog();
        try {
          const frame = JSON.parse(e.data);
          if (Array.isArray(frame.events)) {
            const freshEvents: RealtimeEnvelope[] = [];
            for (const ev of frame.events) {
              if (ev?.id && !seenEventIdsRef.current.has(ev.id)) {
                seenEventIdsRef.current.add(ev.id);
                if (seenEventIdsRef.current.size > 5000) {
                  const it = seenEventIdsRef.current.values();
                  for (let i = 0; i < 1000; i++) seenEventIdsRef.current.delete(it.next().value!);
                }
                freshEvents.push(ev);
                setLastEventId(ev.id);
              }
            }
            if (freshEvents.length > 0 && onBatchEventsRef.current) {
              onBatchEventsRef.current(freshEvents);
            }
          }
        } catch {}
      });

      // Standard single event
      es.onmessage = (e) => {
        resetHeartbeatWatchdog();
        if (!e.data) return;
        try {
          const envelope: RealtimeEnvelope = JSON.parse(e.data);
          if (envelope?.id) {
            if (seenEventIdsRef.current.has(envelope.id)) return; // Dedupe
            seenEventIdsRef.current.add(envelope.id);
            setLastEventId(envelope.id);
            if (onEventRef.current) onEventRef.current(envelope);
          }
        } catch {}
      };

      es.onerror = () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        handleConnectionFailure();
      };
    } catch {
      handleConnectionFailure();
    }
  }, [token, topicsKey, resetHeartbeatWatchdog, handleConnectionFailure]);

  // Keep ref up to date
  connectStreamRef.current = connectStream;

  // Connect only when token or topicsKey changes
  useEffect(() => {
    if (!token) {
      setConnectionState('offline');
      return;
    }
    connectStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (heartbeatWatchdogRef.current) clearTimeout(heartbeatWatchdogRef.current);
      if (slowPollTimerRef.current) clearInterval(slowPollTimerRef.current);
    };
  }, [token, topicsKey, connectStream]);

  // Offline slow poll fallback (every 30s)
  useEffect(() => {
    if (connectionState === 'live' || !token) {
      if (slowPollTimerRef.current) clearInterval(slowPollTimerRef.current);
      return;
    }

    slowPollTimerRef.current = setInterval(async () => {
      setIsCatchingUp(true);
      try {
        const res = await fetch('/api/admin/snapshot', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-admin-token': token
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lastEventId) setLastEventId(data.lastEventId);
        }
      } catch {}
    }, 30000);

    return () => {
      if (slowPollTimerRef.current) clearInterval(slowPollTimerRef.current);
    };
  }, [connectionState, token]);

  const manualReconnect = useCallback(() => {
    setReconnectAttempt(0);
    setNextRetrySeconds(0);
    connectStream();
  }, [connectStream]);

  return {
    connectionState,
    reconnectAttempt,
    nextRetrySeconds,
    missedEventsApplied,
    isCatchingUp,
    lastEventId,
    manualReconnect
  };
}
