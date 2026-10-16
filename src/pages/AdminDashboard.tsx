import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Activity, 
  Users, 
  Server, 
  HardDrive, 
  Clock, 
  ArrowUpRight, 
  Shield, 
  Cpu, 
  Globe, 
  RefreshCw, 
  Zap, 
  BarChart3, 
  Layers, 
  Wifi, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Radio, 
  ExternalLink, 
  ChevronRight, 
  Filter, 
  Eye, 
  EyeOff, 
  Lock, 
  LogOut, 
  Key, 
  ArrowLeft,
  Database,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  RotateCcw,
  AlertTriangle,
  Info
} from 'lucide-react';

interface ActiveUser {
  sessionId: string;
  ip: string;
  browser: string;
  os: string;
  device: string;
  userId: string;
  profileName: string;
  currentPath: string;
  durationSeconds: number;
  bytesTransferred: number;
  totalRequests: number;
  status: 'online' | 'idle';
  lastSeen?: string;
}

interface AdminOverview {
  activeUsersCount: number;
  activeUsers: ActiveUser[];
  totalVisitors: number;
  totalRequests: number;
  totalBytes: number;
  avgDurationSeconds: number;
  redis: {
    connected: boolean;
    cacheHits: number;
    cacheMisses: number;
    hitRatio: string;
  };
  postgres: {
    connected: boolean;
  };
}

interface HourlyItem {
  hour: string;
  requests: number;
  bytes: number;
  activeUsers: number;
}

interface BreakdownItem {
  name: string;
  count: number;
  percentage: number;
}

interface TimeBucket {
  label: string;
  count: number;
  range: string;
}

interface DetailedAnalytics {
  hourlyData: HourlyItem[];
  browserBreakdown: BreakdownItem[];
  osBreakdown: BreakdownItem[];
  deviceBreakdown: BreakdownItem[];
  topPaths: { path: string; count: number }[];
  timeSpentBuckets: TimeBucket[];
}

interface TrafficLog {
  id: string;
  timestamp: number | string;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  bytes: number;
  browser: string;
  os: string;
  device?: string;
  userId?: string;
}

interface UserAccount {
  userId: string;
  name: string;
  username?: string;
  createdAt: string;
  storageMode: string;
  historyCount: number;
  bookmarksCount: number;
}

function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes || 0);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m`;
}

const ALL_METHODS = ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'] as const;

const ALL_STATUS_GROUPS = [
  { id: '2xx', label: '2xx Success', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.15)' },
  { id: '3xx', label: '3xx Redirect', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' },
  { id: '4xx', label: '4xx Client Err', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { id: '5xx', label: '5xx Server Err', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' }
] as const;

const ALL_CATEGORIES = [
  { id: 'api', label: 'API (/api/*)' },
  { id: 'stream', label: 'Media / Stream' },
  { id: 'static', label: 'Static Assets' },
  { id: 'other', label: 'Pages / Other' }
] as const;

function categorizePath(path: string): 'stream' | 'api' | 'static' | 'other' {
  if (!path) return 'other';
  if (/\.(mp4|webm|m3u8|ts|m4s|mp3|ogg|wav)(\?|$)/i.test(path) || path.includes('/stream') || path.includes('/video')) {
    return 'stream';
  }
  if (path.startsWith('/api/')) {
    return 'api';
  }
  if (/\.(js|css|html|png|jpg|jpeg|svg|ico|woff2?|ttf|map)(\?|$)/i.test(path) || path.startsWith('/assets/') || path.startsWith('/node_modules/')) {
    return 'static';
  }
  return 'other';
}

function getStatusGroup(code: number): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
}

export const AdminDashboard: React.FC = () => {
  // Authentication State
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return localStorage.getItem('valor_admin_token') || sessionStorage.getItem('valor_admin_token');
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Login Form State
  const [loginUser, setLoginUser] = useState<string>('admin');
  const [loginPass, setLoginPass] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState<boolean>(false);

  // Tab & Data State
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'traffic' | 'users'>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5); // 0 = off
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User Accounts Search
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');

  // Traffic Feed Advanced Filtering State
  const [hideHeartbeat, setHideHeartbeat] = useState<boolean>(true);
  const [hideLog, setHideLog] = useState<boolean>(true);
  const [errorsOnly, setErrorsOnly] = useState<boolean>(false);
  const [slowOnly, setSlowOnly] = useState<boolean>(false);

  // Multi-Select Filters
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']);
  const [selectedStatusGroups, setSelectedStatusGroups] = useState<string[]>(['2xx', '3xx', '4xx', '5xx']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['api', 'stream', 'static', 'other']);

  // Selection Mode: 'include' (Show Selected) vs 'exclude' (Hide Selected / Show Unselected)
  const [filterMode, setFilterMode] = useState<'include' | 'exclude'>('include');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [trafficSearchQuery, setTrafficSearchQuery] = useState<string>('');
  const [selectedLogDetail, setSelectedLogDetail] = useState<TrafficLog | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Verify existing token on initial mount
  useEffect(() => {
    if (!adminToken) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    fetch('/api/admin/auth/verify', {
      headers: { 'x-admin-token': adminToken }
    })
      .then(r => r.json())
      .then(res => {
        if (res.authenticated) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('valor_admin_token');
          sessionStorage.removeItem('valor_admin_token');
          setAdminToken(null);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [adminToken]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPass
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('valor_admin_token', data.token);
        setAdminToken(data.token);
        setIsAuthenticated(true);
        setLoginPass('');
        showToast('Authenticated as Administrator');
      } else {
        setLoginError(data.error || 'Authentication failed. Please check credentials.');
      }
    } catch (err: any) {
      setLoginError(`Connection error: ${err.message}`);
    } finally {
      setLoginSubmitting(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (adminToken) {
      fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': adminToken 
        },
        body: JSON.stringify({ token: adminToken })
      }).catch(() => {});
    }
    localStorage.removeItem('valor_admin_token');
    sessionStorage.removeItem('valor_admin_token');
    setAdminToken(null);
    setIsAuthenticated(false);
    showToast('Signed out of Admin Console');
  };

  // Fetch Telemetry & Admin Data
  const fetchData = useCallback(async (isManual = false) => {
    if (!adminToken) return;
    if (isManual) setRefreshing(true);
    try {
      const authHeaders = { 'x-admin-token': adminToken };
      const [overviewRes, analyticsRes, logsRes, usersRes] = await Promise.all([
        fetch('/api/admin/overview', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch('/api/admin/analytics', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch('/api/admin/traffic-logs?limit=150', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => []),
        fetch('/api/admin/users', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => [])
      ]);

      if (overviewRes && !overviewRes.error) {
        setOverview(overviewRes);
      }
      if (analyticsRes && !analyticsRes.error) {
        setAnalytics(analyticsRes);
      }
      if (Array.isArray(logsRes)) {
        setTrafficLogs(logsRes);
      }
      if (Array.isArray(usersRes)) {
        setUsersList(usersRes);
      }
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        showToast('Admin session expired. Please sign in again.');
      } else {
        console.error('[AdminDashboard fetch error]', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!isAuthenticated || autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchData(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefreshInterval, fetchData]);

  const handleTerminateSession = async (sessionId: string) => {
    if (!sessionId || !adminToken) return;
    setTerminatingSessionId(sessionId);
    try {
      const res = await fetch('/api/admin/session/terminate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Session terminated.`);
        setOverview(prev => {
          if (!prev) return prev;
          const updated = prev.activeUsers.filter(u => u.sessionId !== sessionId);
          return {
            ...prev,
            activeUsersCount: updated.length,
            activeUsers: updated
          };
        });
      } else {
        showToast(`Termination failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Multi-select and Filter Action Handlers
  const toggleMethod = (method: string) => {
    setSelectedMethods(prev => 
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const selectAllMethods = () => {
    setSelectedMethods([...ALL_METHODS]);
  };

  const clearAllMethods = () => {
    setSelectedMethods([]);
  };

  const toggleStatusGroup = (sg: string) => {
    setSelectedStatusGroups(prev => 
      prev.includes(sg) ? prev.filter(s => s !== sg) : [...prev, sg]
    );
  };

  const selectAllStatusGroups = () => {
    setSelectedStatusGroups(ALL_STATUS_GROUPS.map(s => s.id));
  };

  const clearAllStatusGroups = () => {
    setSelectedStatusGroups([]);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
  };

  const clearAllCategories = () => {
    setSelectedCategories([]);
  };

  const toggleFilterMode = (newMode: 'include' | 'exclude') => {
    if (newMode === filterMode) return;
    setFilterMode(newMode);
    if (newMode === 'exclude') {
      setSelectedMethods([]);
      setSelectedStatusGroups([]);
      setSelectedCategories([]);
    } else {
      setSelectedMethods([...ALL_METHODS]);
      setSelectedStatusGroups(ALL_STATUS_GROUPS.map(s => s.id));
      setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
    }
  };

  const handleResetFilters = () => {
    setHideHeartbeat(true);
    setHideLog(true);
    setErrorsOnly(false);
    setSlowOnly(false);
    setFilterMode('include');
    setSelectedMethods([...ALL_METHODS]);
    setSelectedStatusGroups(ALL_STATUS_GROUPS.map(s => s.id));
    setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
    setTrafficSearchQuery('');
  };

  const isFiltersCustomized = useMemo(() => {
    if (!hideHeartbeat || !hideLog || errorsOnly || slowOnly || trafficSearchQuery.trim()) return true;
    if (filterMode === 'exclude') {
      return selectedMethods.length > 0 || selectedStatusGroups.length > 0 || selectedCategories.length > 0;
    }
    if (selectedMethods.length !== ALL_METHODS.length) return true;
    if (selectedStatusGroups.length !== ALL_STATUS_GROUPS.length) return true;
    if (selectedCategories.length !== ALL_CATEGORIES.length) return true;
    return false;
  }, [
    hideHeartbeat, 
    hideLog, 
    errorsOnly, 
    slowOnly, 
    trafficSearchQuery, 
    filterMode, 
    selectedMethods, 
    selectedStatusGroups, 
    selectedCategories
  ]);

  const filteredTraffic = useMemo(() => {
    return trafficLogs.filter(log => {
      const path = log.path || '';
      const method = (log.method || 'GET').toUpperCase();
      const statusGroup = getStatusGroup(log.statusCode);
      const category = categorizePath(path);

      // 1. Noise reduction filters (Hide Heartbeat & Hide Log)
      if (hideHeartbeat && path.includes('/api/heartbeat')) {
        return false;
      }
      if (hideLog && path.includes('/api/log')) {
        return false;
      }

      // 2. Errors only (4xx & 5xx)
      if (errorsOnly && log.statusCode < 400) {
        return false;
      }

      // 3. Slow requests only (> 200ms)
      if (slowOnly && (log.latencyMs || 0) < 200) {
        return false;
      }

      // 4. Multi-Select Criteria (Method, Status, Category)
      // When filterMode === 'include':
      // The item MUST match selected methods, status groups, and categories.
      // When filterMode === 'exclude':
      // The item is EXCLUDED if it matches ANY of the selected items (i.e. shows unselected items).
      if (filterMode === 'include') {
        if (!selectedMethods.includes(method)) return false;
        if (!selectedStatusGroups.includes(statusGroup)) return false;
        if (!selectedCategories.includes(category)) return false;
      } else {
        if (selectedMethods.length > 0 && selectedMethods.includes(method)) return false;
        if (selectedStatusGroups.length > 0 && selectedStatusGroups.includes(statusGroup)) return false;
        if (selectedCategories.length > 0 && selectedCategories.includes(category)) return false;
      }

      // 5. Search query with negation support ('!' prefix excludes)
      if (trafficSearchQuery.trim()) {
        const tokens = trafficSearchQuery.trim().toLowerCase().split(/\s+/);
        const searchTarget = `${path} ${method} ${log.ip || ''} ${log.browser || ''} ${log.statusCode} ${log.os || ''}`.toLowerCase();

        for (const token of tokens) {
          if (token.startsWith('!')) {
            const neg = token.slice(1);
            if (neg && searchTarget.includes(neg)) {
              return false; // Negation matched: exclude
            }
          } else {
            if (!searchTarget.includes(token)) {
              return false; // Required term missing: exclude
            }
          }
        }
      }

      return true;
    });
  }, [
    trafficLogs, 
    hideHeartbeat, 
    hideLog, 
    errorsOnly, 
    slowOnly, 
    selectedMethods, 
    selectedStatusGroups, 
    selectedCategories, 
    filterMode, 
    trafficSearchQuery
  ]);

  const filteredActiveUsers = useMemo(() => {
    if (!overview?.activeUsers) return [];
    if (!userSearchQuery.trim()) return overview.activeUsers;
    const q = userSearchQuery.toLowerCase();
    return overview.activeUsers.filter(u => 
      u.profileName.toLowerCase().includes(q) || 
      u.ip.includes(q) || 
      u.sessionId.includes(q) || 
      (u.browser || '').toLowerCase().includes(q) ||
      (u.currentPath || '').toLowerCase().includes(q)
    );
  }, [overview?.activeUsers, userSearchQuery]);

  const maxHourlyRequests = useMemo(() => {
    if (!analytics?.hourlyData || analytics.hourlyData.length === 0) return 10;
    const maxVal = Math.max(...analytics.hourlyData.map(h => h.requests));
    return maxVal > 0 ? maxVal : 10;
  }, [analytics]);

  const maxTimeBucketCount = useMemo(() => {
    if (!analytics?.timeSpentBuckets) return 1;
    const maxVal = Math.max(...analytics.timeSpentBuckets.map(b => b.count));
    return maxVal > 0 ? maxVal : 1;
  }, [analytics]);

  // Loading state while checking token
  if (isAuthenticated === null) {
    return (
      <div style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '12px',
        color: 'var(--text-muted, #94a3b8)'
      }}>
        <RefreshCw size={24} className="animate-spin" color="var(--accent-color, #38bdf8)" />
        <span style={{ fontSize: '0.85rem' }}>Verifying Administrator Privileges...</span>
      </div>
    );
  }

  // =========================================================================
  // LOGIN SCREEN (UNAUTHENTICATED)
  // =========================================================================
  if (isAuthenticated === false) {
    return (
      <div style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '14px',
          padding: '2.25rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Minimal Icon */}
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem'
          }}>
            <Shield size={26} color="var(--accent-color, #38bdf8)" />
          </div>

          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center' }}>
            Valor Admin
          </h2>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem', textAlign: 'center' }}>
            System Telemetry & Session Controls
          </p>

          {loginError && (
            <div style={{
              width: '100%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#f87171',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '1.25rem',
              boxSizing: 'border-box'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="admin"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <Users size={15} color="var(--text-muted, #94a3b8)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 38px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <Lock size={15} color="var(--text-muted, #94a3b8)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginSubmitting}
              style={{
                width: '100%',
                backgroundColor: 'var(--accent-color, #38bdf8)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '11px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: loginSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '0.5rem',
                transition: 'all 0.15s ease'
              }}
            >
              {loginSubmitting ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <Key size={15} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <a
            href="/"
            style={{
              marginTop: '1.5rem',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.78rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.15s'
            }}
          >
            <ArrowLeft size={13} />
            <span>Return to Valor Player</span>
          </a>
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED DASHBOARD
  // =========================================================================
  return (
    <div className="admin-dashboard-container" style={{
      padding: '1.75rem 2rem',
      maxWidth: '1440px',
      margin: '0 auto',
      color: 'var(--text-primary)',
      minHeight: '100vh',
      boxSizing: 'border-box'
    }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--accent-color, #38bdf8)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          borderRadius: '8px',
          padding: '10px 18px',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <CheckCircle2 size={16} color="var(--accent-color, #38bdf8)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Clean Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Admin Console
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem' }}>
            Visitor telemetry, active sessions, and database infrastructure
          </p>
        </div>

        {/* Header Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Admin User Chip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '0.78rem',
            color: 'var(--text-muted, #94a3b8)'
          }}>
            <Shield size={13} color="var(--accent-color, #38bdf8)" />
            <span>Admin</span>
          </div>

          {/* Auto Refresh Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            padding: '3px 6px',
            borderRadius: '6px',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            fontSize: '0.75rem'
          }}>
            <span style={{ color: 'var(--text-muted, #94a3b8)', paddingLeft: '4px', fontSize: '0.72rem' }}>Refresh:</span>
            {[
              { label: '3s', val: 3 },
              { label: '5s', val: 5 },
              { label: '15s', val: 15 },
              { label: 'Off', val: 0 }
            ].map(item => (
              <button
                key={item.label}
                onClick={() => setAutoRefreshInterval(item.val)}
                style={{
                  background: autoRefreshInterval === item.val ? 'var(--accent-color, #38bdf8)' : 'transparent',
                  color: autoRefreshInterval === item.val ? '#000' : 'var(--text-muted, #94a3b8)',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.72rem'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Manual Refresh */}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh metrics now"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontWeight: 500
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* Exit to Player Home */}
          <a
            href="/"
            title="Exit to Valor Player"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 500,
              textDecoration: 'none'
            }}
          >
            <ArrowLeft size={13} />
            <span>Player Home</span>
          </a>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Sign out of Administrator Portal"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 500
            }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        marginBottom: '1.75rem',
        overflowX: 'auto'
      }}>
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'sessions', label: `Active Users (${overview?.activeUsersCount ?? 0})`, icon: Users },
          { id: 'traffic', label: 'Traffic Feed', icon: Radio },
          { id: 'users', label: `Registered Accounts (${usersList.length})`, icon: Database },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 15px',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent-color, #38bdf8)' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive ? 'var(--accent-color, #38bdf8)' : 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.12s ease'
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & INFRASTRUCTURE (ONLY IN THIS TAB) */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {/* Top KPI Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.85rem'
          }}>
            {/* 1. Active Users */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1.15rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Active Users
                </span>
                <Users size={16} color="var(--accent-color, #38bdf8)" />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, margin: '6px 0 2px', color: '#38bdf8' }}>
                {overview?.activeUsersCount ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                Past 3 minutes presence
              </div>
            </div>

            {/* 2. Unique Visitors */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1.15rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Unique Visitors
                </span>
                <Globe size={16} color="#4ade80" />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, margin: '6px 0 2px' }}>
                {overview?.totalVisitors ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                Tracked sessions & IPs
              </div>
            </div>

            {/* 3. Bandwidth / Data */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1.15rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Bandwidth
                </span>
                <HardDrive size={16} color="#a855f7" />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, margin: '6px 0 2px', color: '#c084fc' }}>
                {formatBytes(overview?.totalBytes ?? 0)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                Proxied payload volume
              </div>
            </div>

            {/* 4. Total Proxied Requests */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1.15rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Requests
                </span>
                <Activity size={16} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, margin: '6px 0 2px' }}>
                {overview?.totalRequests?.toLocaleString() ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                Total HTTP transactions
              </div>
            </div>

            {/* 5. Avg Session Duration */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1.15rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Avg Time Spent
                </span>
                <Clock size={16} color="#ec4899" />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, margin: '6px 0 2px' }}>
                {formatDuration(overview?.avgDurationSeconds ?? 0)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                Active session duration
              </div>
            </div>
          </div>

          {/* Infrastructure Health Strip (Redis, PostgreSQL, Reverse Proxy) */}
          <div style={{
            backgroundColor: 'var(--surface, #1e293b)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            alignItems: 'center'
          }}>
            {/* Redis Cache */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}>
                <Zap size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Redis Session Cache
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                  {overview?.redis.connected ? (
                    <span style={{ color: '#4ade80' }}>Connected (Port 6379)</span>
                  ) : (
                    <span style={{ color: '#facc15' }}>Fallback Local</span>
                  )}
                  {' • '}Hit ratio: {overview?.redis.hitRatio || '100%'}
                </div>
              </div>
            </div>

            {/* PostgreSQL Tier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}>
                <Database size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  PostgreSQL Tier
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                  {overview?.postgres.connected ? (
                    <span style={{ color: '#4ade80' }}>Connected (Port 5432)</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>SQLite Local</span>
                  )}
                  {' • '}Cloud Storage
                </div>
              </div>
            </div>

            {/* Reverse Proxy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a855f7'
              }}>
                <Shield size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Reverse Proxy
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                  Port 80 (HTTP) <ArrowUpRight size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Port 50001 (API)
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '1.25rem'
          }}>
            {/* Chart 1: Hourly Traffic & Bandwidth Volume Chart */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Hourly Activity</h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>Requests per hour (Past 12 Hours)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#38bdf8', borderRadius: '2px' }} />
                    Requests
                  </span>
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '10px', paddingBottom: '20px', position: 'relative' }}>
                {analytics?.hourlyData && analytics.hourlyData.length > 0 ? (
                  analytics.hourlyData.map((item, idx) => {
                    const heightPercent = Math.max(6, Math.min(100, Math.round((item.requests / maxHourlyRequests) * 100)));
                    return (
                      <div key={idx} style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                        position: 'relative'
                      }}>
                        <div 
                          title={`${item.hour}: ${item.requests} reqs, ${formatBytes(item.bytes)} transferred`}
                          style={{
                            width: '100%',
                            maxWidth: '32px',
                            height: `${heightPercent}%`,
                            background: 'linear-gradient(180deg, #38bdf8 0%, rgba(56, 189, 248, 0.35) 100%)',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                            cursor: 'pointer',
                            position: 'relative'
                          }}
                        >
                          {item.requests > 0 && (
                            <span style={{
                              position: 'absolute',
                              top: '-18px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              fontSize: '0.65rem',
                              color: 'var(--text-muted, #94a3b8)',
                              fontWeight: 600
                            }}>
                              {item.requests}
                            </span>
                          )}
                        </div>
                        <span style={{
                          position: 'absolute',
                          bottom: '0',
                          fontSize: '0.65rem',
                          color: 'var(--text-muted, #94a3b8)',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.hour}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ width: '100%', textAlign: 'center', alignSelf: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem' }}>
                    Collecting hourly traffic telemetry...
                  </div>
                )}
              </div>
            </div>

            {/* Chart 2: Time Spent Distribution */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Time Spent Distribution</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>Session engagement duration buckets</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
                {analytics?.timeSpentBuckets && analytics.timeSpentBuckets.map((bucket, i) => {
                  const widthPercent = Math.max(3, Math.min(100, Math.round((bucket.count / maxTimeBucketCount) * 100)));
                  const colors = ['#38bdf8', '#818cf8', '#a855f7', '#ec4899', '#f43f5e', '#10b981'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={bucket.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 500 }}>{bucket.label} ({bucket.range})</span>
                        <span style={{ color: 'var(--text-muted, #94a3b8)' }}>{bucket.count} user{bucket.count === 1 ? '' : 's'}</span>
                      </div>
                      <div style={{
                        height: '7px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${widthPercent}%`,
                          height: '100%',
                          backgroundColor: color,
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Client Breakdown Row (Browser & OS & Devices) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.25rem'
          }}>
            {/* Browsers */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={15} color="#38bdf8" />
                Browsers
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analytics?.browserBreakdown && analytics.browserBreakdown.length > 0 ? (
                  analytics.browserBreakdown.map((item) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '55%' }}>
                        <div style={{ flex: 1, height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${item.percentage}%`, height: '100%', backgroundColor: '#38bdf8' }} />
                        </div>
                        <span style={{ minWidth: '35px', textAlign: 'right', color: 'var(--text-muted, #94a3b8)', fontSize: '0.72rem' }}>
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>No data</div>
                )}
              </div>
            </div>

            {/* Operating Systems */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={15} color="#a855f7" />
                Operating Systems
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analytics?.osBreakdown && analytics.osBreakdown.length > 0 ? (
                  analytics.osBreakdown.map((item) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '55%' }}>
                        <div style={{ flex: 1, height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${item.percentage}%`, height: '100%', backgroundColor: '#a855f7' }} />
                        </div>
                        <span style={{ minWidth: '35px', textAlign: 'right', color: 'var(--text-muted, #94a3b8)', fontSize: '0.72rem' }}>
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>No data</div>
                )}
              </div>
            </div>

            {/* Top Visited Routes */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={15} color="#10b981" />
                Top Visited Paths
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analytics?.topPaths && analytics.topPaths.length > 0 ? (
                  analytics.topPaths.slice(0, 5).map((p) => (
                    <div key={p.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <code style={{
                        padding: '2px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--accent-color, #38bdf8)',
                        fontSize: '0.75rem'
                      }}>
                        {p.path}
                      </code>
                      <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.72rem', fontWeight: 600 }}>
                        {p.count} hits
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>No records</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVE SESSIONS (FOCUSED, NO CLUTTER) */}
      {/* ========================================================================= */}
      {activeTab === 'sessions' && (
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {/* Header & Search */}
          <div style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Active Connected Sessions</h3>
              <p style={{ margin: '2px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                Real-time sessions tracked in Redis sorted sets with IP and duration
              </p>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative', width: '240px' }}>
              <input
                type="text"
                placeholder="Search user, IP, path..."
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <Search size={14} color="var(--text-muted, #94a3b8)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-muted, #94a3b8)',
                  borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Session Fingerprint</th>
                  <th style={{ padding: '10px 14px' }}>User / Profile</th>
                  <th style={{ padding: '10px 14px' }}>Device & Client</th>
                  <th style={{ padding: '10px 14px' }}>IP Address</th>
                  <th style={{ padding: '10px 14px' }}>Current Location</th>
                  <th style={{ padding: '10px 14px' }}>Time Spent</th>
                  <th style={{ padding: '10px 14px' }}>Data Transferred</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActiveUsers && filteredActiveUsers.length > 0 ? (
                  filteredActiveUsers.map((user) => {
                    const isTerminating = terminatingSessionId === user.sessionId;
                    return (
                      <tr key={user.sessionId} style={{
                        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.04))',
                        transition: 'background-color 0.15s ease'
                      }}>
                        {/* Status */}
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '2px 7px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: user.status === 'online' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                            color: user.status === 'online' ? '#4ade80' : '#facc15'
                          }}>
                            <span style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              backgroundColor: user.status === 'online' ? '#22c55e' : '#eab308'
                            }} />
                            {user.status === 'online' ? 'Online' : 'Idle'}
                          </span>
                        </td>

                        {/* Session ID */}
                        <td style={{ padding: '10px 14px' }}>
                          <code style={{
                            padding: '2px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            fontSize: '0.75rem',
                            color: '#94a3b8'
                          }}>
                            {user.sessionId.slice(0, 16)}...
                          </code>
                        </td>

                        {/* User / Profile */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{user.profileName || 'Guest User'}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>ID: {user.userId || 'Guest'}</div>
                        </td>

                        {/* Client & Device */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {user.device === 'Mobile' ? <Smartphone size={13} /> : user.device === 'Tablet' ? <Tablet size={13} /> : <Monitor size={13} />}
                            <span>{user.browser}</span>
                            <span style={{ color: 'var(--text-muted, #94a3b8)' }}>• {user.os}</span>
                          </div>
                        </td>

                        {/* IP Address */}
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                          {user.ip}
                        </td>

                        {/* Current Location */}
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(56, 189, 248, 0.08)',
                            color: 'var(--accent-color, #38bdf8)',
                            fontSize: '0.72rem'
                          }}>
                            {user.currentPath || '/'}
                          </span>
                        </td>

                        {/* Time Spent */}
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {formatDuration(user.durationSeconds)}
                        </td>

                        {/* Data Transferred */}
                        <td style={{ padding: '10px 14px', color: '#c084fc', fontWeight: 600 }}>
                          {formatBytes(user.bytesTransferred)}
                        </td>

                        {/* Terminate Action */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleTerminateSession(user.sessionId)}
                            disabled={isTerminating}
                            title="Terminate session and evict from Redis"
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: '5px',
                              padding: '4px 8px',
                              cursor: isTerminating ? 'not-allowed' : 'pointer',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={11} />
                            <span>{isTerminating ? 'Ending...' : 'Terminate'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                      No active sessions matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 3: LIVE TRAFFIC FEED (ADVANCED FILTERING & INTERCEPTION) */}
      {/* ========================================================================= */}
      {activeTab === 'traffic' && (
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {/* Header & Controls Bar */}
          <div style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Top row: Title and Stats */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Reverse-Proxy Traffic Stream</h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: 'var(--accent-color, #38bdf8)',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}>
                    {filteredTraffic.length} shown / {trafficLogs.length} total
                    {trafficLogs.length > filteredTraffic.length && (
                      <span style={{ opacity: 0.8, marginLeft: '4px' }}>
                        ({trafficLogs.length - filteredTraffic.length} filtered)
                      </span>
                    )}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                  Live interception log of HTTP requests, status codes, latency, and client details
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isFiltersCustomized && (
                  <button
                    onClick={handleResetFilters}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease'
                    }}
                    title="Reset all filters to default"
                  >
                    <RotateCcw size={12} />
                    Reset All Filters
                  </button>
                )}

                <button
                  onClick={() => setShowAdvancedFilters(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: showAdvancedFilters ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: showAdvancedFilters ? '1px solid var(--accent-color, #38bdf8)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                    color: showAdvancedFilters ? 'var(--accent-color, #38bdf8)' : 'var(--text-primary)',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <SlidersHorizontal size={13} />
                  <span>Advanced Filters</span>
                  {filterMode === 'exclude' && (
                    <span style={{
                      backgroundColor: '#f59e0b',
                      color: '#000',
                      borderRadius: '3px',
                      padding: '1px 4px',
                      fontSize: '0.62rem',
                      fontWeight: 700
                    }}>
                      EXCLUDE
                    </span>
                  )}
                  {showAdvancedFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
            </div>

            {/* Quick Filter Strip (Always Visible) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
              paddingTop: '6px'
            }}>
              {/* Quick noise reduction & flags */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginRight: '2px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Quick Filters:
                </span>

                {/* Hide Heartbeats */}
                <button
                  onClick={() => setHideHeartbeat(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: hideHeartbeat ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: hideHeartbeat ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: hideHeartbeat ? '#4ade80' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Hide telemetry polling from /api/heartbeat"
                >
                  {hideHeartbeat ? <Check size={11} strokeWidth={3} /> : <span style={{ width: '11px', height: '11px', borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
                  Hide Heartbeats
                </button>

                {/* Hide Logs */}
                <button
                  onClick={() => setHideLog(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: hideLog ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: hideLog ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: hideLog ? '#4ade80' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Hide client event logs from /api/log"
                >
                  {hideLog ? <Check size={11} strokeWidth={3} /> : <span style={{ width: '11px', height: '11px', borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
                  Hide Logs
                </button>

                {/* Errors Only */}
                <button
                  onClick={() => setErrorsOnly(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: errorsOnly ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: errorsOnly ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: errorsOnly ? '#f87171' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Show only 4xx and 5xx responses"
                >
                  <AlertTriangle size={11} />
                  Errors Only
                </button>

                {/* Slow Only */}
                <button
                  onClick={() => setSlowOnly(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: slowOnly ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: slowOnly ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: slowOnly ? '#fbbf24' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Show requests taking longer than 200ms"
                >
                  <Clock size={11} />
                  Slow (&gt;200ms)
                </button>
              </div>

              {/* Search with Negation */}
              <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
                <input
                  type="text"
                  placeholder="Search path, IP, method... (!word to exclude)"
                  value={trafficSearchQuery}
                  onChange={e => setTrafficSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 28px 6px 28px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <Search size={13} color="var(--text-muted, #94a3b8)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                {trafficSearchQuery && (
                  <button
                    onClick={() => setTrafficSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: '2px',
                      cursor: 'pointer',
                      color: 'var(--text-muted, #94a3b8)'
                    }}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Expandable Advanced Filters Drawer */}
            {showAdvancedFilters && (
              <div style={{
                marginTop: '6px',
                padding: '1rem 1.15rem',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Mode Selector: Include vs Exclude */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  paddingBottom: '10px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>
                      Filtering Behavior:
                    </span>
                    <div style={{
                      display: 'flex',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '6px',
                      padding: '2px',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))'
                    }}>
                      <button
                        onClick={() => toggleFilterMode('include')}
                        style={{
                          backgroundColor: filterMode === 'include' ? 'var(--accent-color, #38bdf8)' : 'transparent',
                          color: filterMode === 'include' ? '#000' : 'var(--text-muted, #94a3b8)',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Show Selected (Include)
                      </button>
                      <button
                        onClick={() => toggleFilterMode('exclude')}
                        style={{
                          backgroundColor: filterMode === 'exclude' ? '#f59e0b' : 'transparent',
                          color: filterMode === 'exclude' ? '#000' : 'var(--text-muted, #94a3b8)',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Show Unselected / Hide Selected (Exclude)
                      </button>
                    </div>
                  </div>

                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                    {filterMode === 'include' 
                      ? '✓ Showing requests matching selected methods, status codes, and categories' 
                      : '⊘ Hiding selected items (showing unselected traffic)'}
                  </span>
                </div>

                {/* HTTP Methods Group */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ width: '130px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>Methods:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={selectAllMethods}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-color, #38bdf8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        All
                      </button>
                      <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '0.66rem' }}>|</span>
                      <button
                        onClick={clearAllMethods}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {ALL_METHODS.map(m => {
                      const isSelected = selectedMethods.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleMethod(m)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: isSelected 
                              ? (filterMode === 'include' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)')
                              : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected 
                              ? (filterMode === 'include' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)')
                              : '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                            color: isSelected 
                              ? (filterMode === 'include' ? '#38bdf8' : '#fbbf24')
                              : 'var(--text-muted, #94a3b8)',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isSelected && (filterMode === 'include' ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />)}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status Codes Group */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ width: '130px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>Status:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={selectAllStatusGroups}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-color, #38bdf8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        All
                      </button>
                      <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '0.66rem' }}>|</span>
                      <button
                        onClick={clearAllStatusGroups}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {ALL_STATUS_GROUPS.map(sg => {
                      const isSelected = selectedStatusGroups.includes(sg.id);
                      return (
                        <button
                          key={sg.id}
                          onClick={() => toggleStatusGroup(sg.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: isSelected ? sg.bg : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected ? `1px solid ${sg.color}55` : '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                            color: isSelected ? sg.color : 'var(--text-muted, #94a3b8)',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isSelected && (filterMode === 'include' ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />)}
                          {sg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Resource Categories Group */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ width: '130px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>Category:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={selectAllCategories}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-color, #38bdf8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        All
                      </button>
                      <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '0.66rem' }}>|</span>
                      <button
                        onClick={clearAllCategories}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)', fontSize: '0.66rem', cursor: 'pointer', padding: '0 2px' }}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {ALL_CATEGORIES.map(cat => {
                      const isSelected = selectedCategories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: isSelected 
                              ? (filterMode === 'include' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(245, 158, 11, 0.16)')
                              : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected 
                              ? (filterMode === 'include' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)')
                              : '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                            color: isSelected 
                              ? (filterMode === 'include' ? '#38bdf8' : '#fbbf24')
                              : 'var(--text-muted, #94a3b8)',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isSelected && (filterMode === 'include' ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />)}
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Traffic Table */}
          <div style={{ overflowX: 'auto', maxHeight: '720px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--surface, #1e293b)', zIndex: 2 }}>
                <tr style={{
                  color: 'var(--text-muted, #94a3b8)',
                  borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '9px 12px' }}>Time</th>
                  <th style={{ padding: '9px 12px' }}>Method</th>
                  <th style={{ padding: '9px 12px' }}>Status</th>
                  <th style={{ padding: '9px 12px' }}>Type</th>
                  <th style={{ padding: '9px 12px' }}>Path</th>
                  <th style={{ padding: '9px 12px' }}>Latency</th>
                  <th style={{ padding: '9px 12px' }}>Bytes</th>
                  <th style={{ padding: '9px 12px' }}>Client</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredTraffic && filteredTraffic.length > 0 ? (
                  filteredTraffic.map((log) => {
                    const isError = log.statusCode >= 400;
                    const method = (log.method || 'GET').toUpperCase();
                    const methodColor = 
                      method === 'GET' ? '#38bdf8' : 
                      method === 'POST' ? '#a855f7' : 
                      method === 'OPTIONS' ? '#f59e0b' : 
                      method === 'DELETE' ? '#ef4444' : '#34d399';

                    const category = categorizePath(log.path);
                    const categoryColor = 
                      category === 'api' ? '#38bdf8' : 
                      category === 'stream' ? '#c084fc' : 
                      category === 'static' ? '#94a3b8' : '#fbbf24';

                    const timeStr = typeof log.timestamp === 'number' 
                      ? new Date(log.timestamp).toLocaleTimeString() 
                      : String(log.timestamp).slice(11, 19);

                    const isSlow = (log.latencyMs || 0) > 300;

                    return (
                      <tr key={log.id || Math.random()} style={{
                        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.03))',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        backgroundColor: isError ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                      }}>
                        <td style={{ padding: '7px 12px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
                          {timeStr}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            backgroundColor: `${methodColor}18`,
                            color: methodColor,
                            fontWeight: 700
                          }}>
                            {method}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            backgroundColor: isError ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.18)',
                            color: isError ? '#f87171' : '#4ade80',
                            fontWeight: 600
                          }}>
                            {log.statusCode}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: `${categoryColor}15`,
                            color: categoryColor,
                            fontSize: '0.66rem',
                            fontWeight: 600,
                            textTransform: 'uppercase'
                          }}>
                            {category}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {log.path}
                        </td>
                        <td style={{ padding: '7px 12px', color: isSlow ? '#fbbf24' : '#94a3b8', whiteSpace: 'nowrap' }}>
                          {Math.round(log.latencyMs || 0)} ms
                        </td>
                        <td style={{ padding: '7px 12px', color: '#c084fc', whiteSpace: 'nowrap' }}>
                          {formatBytes(log.bytes || 0)}
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
                          {log.ip} {log.browser && `(${log.browser})`}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedLogDetail(log)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-color, #38bdf8)',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                            title="Inspect Request Details"
                          >
                            <Info size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Filter size={24} style={{ opacity: 0.4 }} />
                        <span style={{ fontWeight: 600 }}>No requests match the active filter criteria.</span>
                        <span style={{ fontSize: '0.74rem' }}>
                          Try clearing search terms or toggling "Hide Heartbeats" / "Hide Logs" / methods.
                        </span>
                        {isFiltersCustomized && (
                          <button
                            onClick={handleResetFilters}
                            style={{
                              marginTop: '6px',
                              backgroundColor: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: 'var(--accent-color, #38bdf8)',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Reset All Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Request Details Modal */}
          {selectedLogDetail && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div style={{
                width: '100%',
                maxWidth: '600px',
                backgroundColor: 'var(--surface, #1e293b)',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                color: 'var(--text-primary)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: 'var(--accent-color, #38bdf8)',
                      fontWeight: 700,
                      fontSize: '0.75rem'
                    }}>
                      {selectedLogDetail.method}
                    </span>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Request Inspection</h4>
                  </div>
                  <button
                    onClick={() => setSelectedLogDetail(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Path:</span>
                    <span style={{ wordBreak: 'break-all', textAlign: 'right', fontWeight: 600 }}>{selectedLogDetail.path}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Status:</span>
                    <span style={{ color: selectedLogDetail.statusCode >= 400 ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                      {selectedLogDetail.statusCode}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Latency:</span>
                    <span>{Math.round(selectedLogDetail.latencyMs || 0)} ms</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Data Transferred:</span>
                    <span style={{ color: '#c084fc' }}>{formatBytes(selectedLogDetail.bytes || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Client IP:</span>
                    <span>{selectedLogDetail.ip}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Browser & OS:</span>
                    <span>{selectedLogDetail.browser} / {selectedLogDetail.os} ({selectedLogDetail.device || 'Desktop'})</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>User ID:</span>
                    <span>{selectedLogDetail.userId || 'Guest'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Timestamp:</span>
                    <span>{typeof selectedLogDetail.timestamp === 'number' ? new Date(selectedLogDetail.timestamp).toISOString() : String(selectedLogDetail.timestamp)}</span>
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setSelectedLogDetail(null)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '6px 16px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: REGISTERED ACCOUNTS (FOCUSED, NO CLUTTER) */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>User Accounts</h3>
              <p style={{ margin: '2px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                Registered profiles and storage architectures
              </p>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)' }}>
              {usersList.length} Total Registered
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-muted, #94a3b8)',
                  borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '10px 14px' }}>User ID</th>
                  <th style={{ padding: '10px 14px' }}>Name / Username</th>
                  <th style={{ padding: '10px 14px' }}>Storage Architecture</th>
                  <th style={{ padding: '10px 14px' }}>Created Date</th>
                  <th style={{ padding: '10px 14px' }}>History</th>
                  <th style={{ padding: '10px 14px' }}>Bookmarks</th>
                </tr>
              </thead>
              <tbody>
                {usersList.length > 0 ? (
                  usersList.map((account) => {
                    const isCloud = account.storageMode.includes('PostgreSQL');
                    return (
                      <tr key={account.userId} style={{
                        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.04))'
                      }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted, #94a3b8)' }}>
                          {account.userId}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{account.name}</div>
                          {account.username && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--accent-color, #38bdf8)' }}>@{account.username}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: isCloud ? 'rgba(56, 189, 248, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                            color: isCloud ? '#38bdf8' : '#cbd5e1'
                          }}>
                            {isCloud ? <Database size={11} /> : <HardDrive size={11} />}
                            {account.storageMode}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem' }}>
                          {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {account.historyCount || 0}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {account.bookmarksCount || 0}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                      No registered user profiles found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
