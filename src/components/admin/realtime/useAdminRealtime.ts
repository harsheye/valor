import { useState, useEffect, useRef, useCallback } from 'react';

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

  // Sync ref
  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  // Heartbeat watchdog: if no activity for 35s, reconnect
  const resetHeartbeatWatchdog = useCallback(() => {
    if (heartbeatWatchdogRef.current) clearTimeout(heartbeatWatchdogRef.current);
    heartbeatWatchdogRef.current = setTimeout(() => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        handleConnectionFailure();
      }
    }, 35000);
  }, []);

  const handleConnectionFailure = useCallback(() => {
    setConnectionState('reconnecting');
    setReconnectAttempt(prev => {
      const nextAttempt = prev + 1;
      const delayMs = Math.min(1000 * Math.pow(1.8, nextAttempt - 1), 30000);
      const delaySec = Math.round(delayMs / 1000);
      setNextRetrySeconds(delaySec);

      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      let remaining = delaySec;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setNextRetrySeconds(Math.max(remaining, 0));
        if (remaining <= 0) clearInterval(countdownTimerRef.current);
      }, 1000);

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        connectStream();
      }, delayMs);

      return nextAttempt;
    });
  }, []);

  const connectStream = useCallback(() => {
    if (!token) return;

    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }

    const topicsQuery = topics.join(',');
    const currentLastId = lastEventIdRef.current;
    let url = `/admin/stream?topics=${encodeURIComponent(topicsQuery)}&token=${encodeURIComponent(token)}`;
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
            if (onSyncMissed) onSyncMissed(syncData.replayedCount);
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
                  // Keep set bounded
                  const it = seenEventIdsRef.current.values();
                  for (let i = 0; i < 1000; i++) seenEventIdsRef.current.delete(it.next().value!);
                }
                freshEvents.push(ev);
                setLastEventId(ev.id);
              }
            }
            if (freshEvents.length > 0 && onBatchEvents) {
              onBatchEvents(freshEvents);
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
            if (onEvent) onEvent(envelope);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        handleConnectionFailure();
      };
    } catch (err) {
      handleConnectionFailure();
    }
  }, [token, topics, onEvent, onBatchEvents, onSyncMissed, resetHeartbeatWatchdog, handleConnectionFailure]);

  // Initial connect
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
  }, [token, connectStream]);

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
