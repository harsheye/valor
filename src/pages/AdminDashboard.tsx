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
  Info,
  Calendar,
  TrendingUp,
  Laptop,
  Copy,
  Play,
  Pause,
  Compass,
  Share2,
  Flame,
  Send,
  MapPin,
  Download,
  Power,
  ShieldAlert,
  Film
} from 'lucide-react';

import { VisitedDevicesTab } from '../components/admin/VisitedDevicesTab';
import { OpenSessionsTab } from '../components/admin/OpenSessionsTab';
import { WebhooksTab } from '../components/admin/WebhooksTab';
import { DeviceDetailModal } from '../components/admin/DeviceDetailModal';
import { SaaSTrendCharts } from '../components/admin/SaaSTrendCharts';

interface ActiveUser {
  sessionId: string;
  deviceId?: string;
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
  status: 'online' | 'idle' | 'streaming';
  lastSeen?: string;
  firstSeen?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  reverseDns?: string;
  flag?: string;
  isMyDevice?: boolean;
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

interface ActivityItem {
  label: string;
  sublabel?: string;
  date?: string;
  hour?: string;
  requests: number;
  bytes: number;
  activeUsers: number;
  thirdPartyRequests?: number;
}

interface AvailableDateItem {
  day: string;
  count: number;
  third_party_count: number;
}

interface ThirdPartyEndpoint {
  service: string;
  path: string;
  requests: number;
  bytes: number;
  avgLatencyMs: number;
  errorCount: number;
  lastCalled?: string | null;
}

interface ThirdPartyService {
  name: string;
  service?: string;
  requests: number;
  bytes: number;
  avgLatencyMs: number;
  errorCount: number;
  lastCalled?: string | null;
  status: 'operational' | 'degraded' | 'offline';
}

interface ThirdPartyStats {
  totalRequests: number;
  totalBytes: number;
  avgLatencyMs: number;
  services: ThirdPartyService[];
  endpoints: ThirdPartyEndpoint[];
}

interface TimeframeSummary {
  timeframe: string;
  targetDate: string;
  totalRequests: number;
  totalBytes: number;
  totalVisitors: number;
  thirdPartyRequests: number;
  thirdPartyRatio: string;
  peakActivity: { label: string; requests: number };
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
  timeframe?: string;
  targetDate?: string;
  activityData?: ActivityItem[];
  hourlyData: ActivityItem[];
  timeframeSummary?: TimeframeSummary;
  availableDates?: AvailableDateItem[];
  thirdPartyStats?: ThirdPartyStats;
  browserBreakdown: BreakdownItem[];
  osBreakdown: BreakdownItem[];
  deviceBreakdown: BreakdownItem[];
  topPaths: { path: string; count: number }[];
  timeSpentBuckets: TimeBucket[];
}

interface VisitorDevice {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
  totalDurationSeconds: number;
  totalRequests: number;
  bytesTransferred: number;
  lastIp: string;
  ips: string[];
  userAgent?: string;
  browser: string;
  os: string;
  device: string;
  userId?: string;
  profileName?: string;
  embedCallsCount: number;
  embedReferers: string[];
  lastPath?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  org?: string;
  lat?: number | string;
  lon?: number | string;
  reverseDns?: string;
  flag?: string;
  isMyDevice?: boolean;
}

interface VisitorDevicesResponse {
  devices: VisitorDevice[];
  totalDevicesCount: number;
  totalEmbedCallsCount: number;
  topEmbedReferrers: { referer: string; count: number; last_seen?: string }[];
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
  deviceId?: string;
  referer?: string;
  isEmbed?: boolean;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  reverseDns?: string;
  flag?: string;
  isMyDevice?: boolean;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string | null;
  totalDeliveries: number;
  failedDeliveries: number;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  webhookName: string;
  event: string;
  status: 'success' | 'failed';
  statusCode: number;
  latencyMs: number;
  payload: string;
  responseBody?: string;
  createdAt: string;
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
  { id: '3rdparty', label: '3rd Party APIs (VLR, Trakt, TMDB)', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  { id: 'api', label: 'Internal API (/api/*)', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
  { id: 'stream', label: 'Media / Stream', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)' },
  { id: 'static', label: 'Static Assets', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  { id: 'other', label: 'Pages / Other', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' }
] as const;

export function isThirdPartyPath(path: string): boolean {
  if (!path) return false;
  return (
    path.startsWith('/api/vlr') ||
    path.startsWith('/api/trakt') ||
    path.startsWith('/api/tmdb') ||
    path.includes('/subtitles') ||
    path.includes('opensubtitles') ||
    path.includes('vlr.gg') ||
    path.includes('trakt.tv') ||
    path.includes('themoviedb.org')
  );
}

export function getThirdPartyService(path: string): string {
  if (!path) return 'Other';
  if (path.includes('/vlr') || path.includes('vlr.gg')) return 'VLR.gg';
  if (path.includes('/trakt') || path.includes('trakt.tv')) return 'Trakt.tv';
  if (path.includes('/tmdb') || path.includes('themoviedb.org')) return 'TMDB';
  if (path.includes('/subtitles') || path.includes('opensubtitles')) return 'OpenSubtitles';
  return '3rd Party';
}

function categorizePath(path: string): '3rdparty' | 'stream' | 'api' | 'static' | 'other' {
  if (!path) return 'other';
  if (isThirdPartyPath(path)) {
    return '3rdparty';
  }
  if (/\.(mp4|webm|m3u8|ts|m4s|mp3|ogg|wav)(\?|$)/i.test(path) || path.includes('/stream') || path.includes('/video') || path.includes('/local-video-stream')) {
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
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'sessions' | 'traffic' | 'webhooks' | 'thirdparty' | 'users'>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [webhooksList, setWebhooksList] = useState<Webhook[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);

  // Visitor Devices Directory & Intelligence State
  const [devicesList, setDevicesList] = useState<VisitorDevice[]>([]);
  const [totalDevicesCount, setTotalDevicesCount] = useState<number>(0);
  const [totalEmbedCallsCount, setTotalEmbedCallsCount] = useState<number>(0);
  const [topEmbedReferrers, setTopEmbedReferrers] = useState<{ referer: string; count: number; last_seen?: string }[]>([]);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState<string>('');
  const [deviceSortBy, setDeviceSortBy] = useState<'last_seen' | 'visits' | 'duration' | 'requests' | 'bytes' | 'embeds'>('last_seen');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'external_only' | 'my_device' | 'embeds_only' | 'mobile' | 'desktop' | 'tablet'>('all');
  const [selectedDeviceDetail, setSelectedDeviceDetail] = useState<VisitorDevice | null>(null);
  const [selectedDeviceLogs, setSelectedDeviceLogs] = useState<TrafficLog[]>([]);
  const [deviceDetailLoading, setDeviceDetailLoading] = useState<boolean>(false);
  const [adminCallerIp, setAdminCallerIp] = useState<string>('');
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isLiveStreamConnected, setIsLiveStreamConnected] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = Live Webhook Stream Mode (No polling refreshes)
  const [isStreamPaused, setIsStreamPaused] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User Accounts Search
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');

  // Activity Timeframe State (Months, Weeks, Days, and Any Day)
  const [activityTimeframe, setActivityTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'custom_day'>('day');
  const [selectedActivityDate, setSelectedActivityDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Third-Party Health Ping State
  const [thirdPartyPingLoading, setThirdPartyPingLoading] = useState<boolean>(false);
  const [thirdPartyPingResults, setThirdPartyPingResults] = useState<any[] | null>(null);

  // Traffic Feed Advanced Filtering & Preset State
  const [hideHeartbeat, setHideHeartbeat] = useState<boolean>(true);
  const [hideLog, setHideLog] = useState<boolean>(true);
  const [errorsOnly, setErrorsOnly] = useState<boolean>(false);
  const [slowOnly, setSlowOnly] = useState<boolean>(false);
  const [embedOnlyFilter, setEmbedOnlyFilter] = useState<boolean>(false);
  const [selectedDeviceIdFilter, setSelectedDeviceIdFilter] = useState<string>('');
  const [activeQuickPreset, setActiveQuickPreset] = useState<'all' | '3rdparty' | 'embed' | 'errors' | 'slow' | 'stream' | 'today'>('all');

  // Traffic Scope & Deep Database Filters
  const [trafficDateFilter, setTrafficDateFilter] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [trafficCustomDate, setTrafficCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedProvider, setSelectedProvider] = useState<string>('all'); // 'all', 'vlr', 'trakt', 'tmdb', 'opensubtitles'
  const [selectedLatencyFilter, setSelectedLatencyFilter] = useState<'all' | 'fast' | 'normal' | 'slow' | 'veryslow'>('all');
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<string>('all');
  const [selectedBrowserFilter, setSelectedBrowserFilter] = useState<string>('all');
  const [trafficPayloadFilter, setTrafficPayloadFilter] = useState<'all' | 'small' | 'medium' | 'large'>('all');
  const [trafficSortOrder, setTrafficSortOrder] = useState<'newest' | 'oldest' | 'slowest' | 'fastest' | 'largest'>('newest');
  const [trafficLimit, setTrafficLimit] = useState<number>(150);

  // Multi-Select Filters
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']);
  const [selectedStatusGroups, setSelectedStatusGroups] = useState<string[]>(['2xx', '3xx', '4xx', '5xx']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['3rdparty', 'api', 'stream', 'static', 'other']);

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
  const fetchData = useCallback(async (isManual = false, overrideTimeframe?: string, overrideDate?: string) => {
    if (!adminToken) return;
    if (isManual) setRefreshing(true);
    try {
      const authHeaders = { 'x-admin-token': adminToken };
      const tf = overrideTimeframe || activityTimeframe;
      const dt = overrideDate || selectedActivityDate;

      let trafficUrl = `/api/admin/traffic-logs?limit=${trafficLimit}`;
      if (selectedProvider !== 'all') {
        trafficUrl += `&provider=${encodeURIComponent(selectedProvider)}`;
      }
      if (trafficDateFilter === 'today') {
        trafficUrl += `&date=${new Date().toISOString().slice(0, 10)}`;
      } else if (trafficDateFilter === 'yesterday') {
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        trafficUrl += `&date=${yest}`;
      } else if (trafficDateFilter === 'custom' && trafficCustomDate) {
        trafficUrl += `&date=${trafficCustomDate}`;
      }
      if (selectedDeviceIdFilter) {
        trafficUrl += `&deviceId=${encodeURIComponent(selectedDeviceIdFilter)}`;
      }
      if (embedOnlyFilter) {
        trafficUrl += `&embedOnly=true`;
      }

      let devicesUrl = `/api/admin/devices?limit=100&sortBy=${deviceSortBy}&filter=${deviceFilter}`;
      if (deviceSearchQuery.trim()) {
        devicesUrl += `&search=${encodeURIComponent(deviceSearchQuery.trim())}`;
      }

      const [overviewRes, analyticsRes, logsRes, usersRes, devicesRes, webhooksRes, deliveriesRes] = await Promise.all([
        fetch('/api/admin/overview', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch(`/api/admin/analytics?timeframe=${tf}&targetDate=${dt}`, { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch(trafficUrl, { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => []),
        fetch('/api/admin/users', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => []),
        fetch(devicesUrl, { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch('/api/admin/webhooks', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null),
        fetch('/api/admin/webhooks/deliveries', { headers: authHeaders }).then(r => {
          if (r.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
          return r.json();
        }).catch(() => null)
      ]);

      if (overviewRes && !overviewRes.error) {
        setOverview(overviewRes);
        if (overviewRes.adminIp) setAdminCallerIp(overviewRes.adminIp);
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
      if (devicesRes && !devicesRes.error) {
        setDevicesList(devicesRes.devices || []);
        setTotalDevicesCount(devicesRes.totalDevicesCount || 0);
        setTotalEmbedCallsCount(devicesRes.totalEmbedCallsCount || 0);
        setTopEmbedReferrers(devicesRes.topEmbedReferrers || []);
        if (devicesRes.adminIp) setAdminCallerIp(devicesRes.adminIp);
      }
      if (webhooksRes && !webhooksRes.error) {
        setWebhooksList(webhooksRes.webhooks || []);
      }
      if (deliveriesRes && !deliveriesRes.error) {
        setWebhookDeliveries(deliveriesRes.deliveries || []);
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
  }, [
    adminToken, 
    activityTimeframe, 
    selectedActivityDate, 
    trafficLimit, 
    trafficDateFilter, 
    trafficCustomDate, 
    selectedProvider,
    selectedDeviceIdFilter,
    embedOnlyFilter,
    deviceSortBy,
    deviceFilter,
    deviceSearchQuery
  ]);

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    showToast(`Copied: ${text.length > 28 ? text.slice(0, 28) + '...' : text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInspectDevice = async (device: VisitorDevice) => {
    setSelectedDeviceDetail(device);
    setDeviceDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(device.deviceId)}`, {
        headers: { 'x-admin-token': adminToken || '' }
      });
      const data = await res.json();
      if (data && data.device) {
        setSelectedDeviceDetail(data.device);
        setSelectedDeviceLogs(data.recentLogs || []);
      }
    } catch (e: any) {
      console.error('Failed to load device details:', e);
    } finally {
      setDeviceDetailLoading(false);
    }
  };

  const handleFilterByDevice = (deviceId: string) => {
    setSelectedDeviceIdFilter(deviceId);
    setActiveTab('traffic');
    showToast(`Filtering traffic for device ${deviceId.slice(0, 16)}...`);
  };

  const handleTimeframeChange = (tf: 'day' | 'week' | 'month' | 'year' | 'custom_day') => {
    setActivityTimeframe(tf);
    fetchData(false, tf, selectedActivityDate);
  };

  const handleActivityDateChange = (dt: string) => {
    setSelectedActivityDate(dt);
    setActivityTimeframe('custom_day');
    fetchData(false, 'custom_day', dt);
  };

  const handlePingThirdParty = async () => {
    if (!adminToken) return;
    setThirdPartyPingLoading(true);
    try {
      const res = await fetch('/api/admin/third-party/ping', {
        headers: { 'x-admin-token': adminToken }
      });
      const data = await res.json();
      if (data && data.providers) {
        setThirdPartyPingResults(data.providers);
        showToast('3rd Party API connectivity test completed');
      }
    } catch (e: any) {
      showToast(`Ping failed: ${e.message}`);
    } finally {
      setThirdPartyPingLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // Real-Time Server-Sent Events / Live Webhook Push Stream (Zero API Polling)
  useEffect(() => {
    if (!isAuthenticated || !adminToken) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectLiveStream = () => {
      try {
        eventSource = new EventSource(`/api/admin/live-stream?token=${encodeURIComponent(adminToken)}`);

        eventSource.onopen = () => {
          setIsLiveStreamConnected(true);
        };

        eventSource.onmessage = (event) => {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'connected') {
              setIsLiveStreamConnected(true);
              if (parsed.adminIp) setAdminCallerIp(parsed.adminIp);
            } else if (parsed.type === 'traffic_log' && parsed.data) {
              const newLog = parsed.data;
              setTrafficLogs(prev => {
                if (prev.some(l => l.id === newLog.id)) return prev;
                return [newLog, ...prev.slice(0, 249)];
              });
            } else if (parsed.type === 'session_update' && parsed.data) {
              const sUpdate = parsed.data;
              setOverview(prev => {
                if (!prev) return prev;
                const existingIdx = prev.activeUsers.findIndex(u => u.sessionId === sUpdate.sessionId);
                let updatedUsers: ActiveUser[];
                if (existingIdx >= 0) {
                  updatedUsers = [...prev.activeUsers];
                  updatedUsers[existingIdx] = { ...updatedUsers[existingIdx], ...sUpdate };
                } else {
                  updatedUsers = [sUpdate, ...prev.activeUsers];
                }
                return {
                  ...prev,
                  activeUsersCount: updatedUsers.length,
                  activeUsers: updatedUsers
                };
              });
            } else if (parsed.type === 'device_update' && parsed.data) {
              const dUpdate = parsed.data;
              setDevicesList(prev => {
                const existingIdx = prev.findIndex(d => d.deviceId === dUpdate.deviceId);
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = {
                    ...updated[existingIdx],
                    ...dUpdate,
                    totalRequests: (updated[existingIdx].totalRequests || 0) + 1,
                    lastSeen: new Date().toISOString()
                  };
                  return updated;
                } else {
                  return [dUpdate, ...prev];
                }
              });
            } else if (parsed.type === 'webhook_delivery' && parsed.data) {
              const delivery = parsed.data;
              setWebhookDeliveries(prev => [delivery, ...prev.slice(0, 99)]);
            }
          } catch (e) {}
        };

        eventSource.onerror = () => {
          setIsLiveStreamConnected(false);
          eventSource?.close();
          reconnectTimeout = setTimeout(connectLiveStream, 3500);
        };
      } catch (err) {
        setIsLiveStreamConnected(false);
      }
    };

    connectLiveStream();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      setIsLiveStreamConnected(false);
    };
  }, [isAuthenticated, adminToken]);

  // Optional polling interval (disabled by default in favor of zero-polling live stream)
  useEffect(() => {
    if (!isAuthenticated || autoRefreshInterval <= 0 || isStreamPaused) return;
    const interval = setInterval(() => {
      fetchData(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefreshInterval, isStreamPaused, fetchData]);

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

  const handleFilterSessionLogs = (sessionId: string) => {
    setTrafficSearchQuery(sessionId);
    setActiveTab('traffic');
    showToast(`Filtering traffic logs for session ${sessionId.slice(0, 16)}...`);
  };

  const handleBlockIp = async (ip: string) => {
    if (!ip || !adminToken) return;
    const confirmBlock = window.confirm(`Are you sure you want to block IP address "${ip}"? Any subsequent requests from this IP will be rejected.`);
    if (!confirmBlock) return;
    try {
      const res = await fetch('/api/admin/block-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ ip, reason: 'Manual block by admin from dashboard' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🛡️ IP ${ip} blocked successfully.`);
      } else {
        showToast(`Failed to block IP: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Block IP error: ${e.message}`);
    }
  };

  const handleCreateWebhook = async (data: { name: string; url: string; secret?: string; events: string[]; enabled: boolean }) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok && resData.webhook) {
        setWebhooksList(prev => [resData.webhook, ...prev]);
        showToast(`Webhook "${resData.webhook.name}" registered successfully.`);
      } else {
        showToast(`Failed to create webhook: ${resData.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Webhook creation error: ${e.message}`);
    }
  };

  const handleUpdateWebhook = async (id: string, data: any) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/webhooks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok && resData.webhook) {
        setWebhooksList(prev => prev.map(w => w.id === id ? resData.webhook : w));
        showToast('Webhook updated.');
      } else {
        showToast(`Failed to update webhook: ${resData.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Update error: ${e.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/webhooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken }
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setWebhooksList(prev => prev.filter(w => w.id !== id));
        showToast('Webhook deleted.');
      } else {
        showToast(`Failed to delete webhook: ${resData.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Delete error: ${e.message}`);
    }
  };

  const handleTestWebhook = async (id: string) => {
    if (!adminToken) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/admin/webhooks/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      const data = await res.json();
      if (data.delivery) {
        setWebhookDeliveries(prev => [data.delivery, ...prev]);
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message };
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
    setEmbedOnlyFilter(false);
    setSelectedDeviceIdFilter('');
    setActiveQuickPreset('all');
    setSelectedProvider('all');
    setSelectedLatencyFilter('all');
    setSelectedDeviceFilter('all');
    setSelectedBrowserFilter('all');
    setTrafficPayloadFilter('all');
    setTrafficDateFilter('all');
    setTrafficSortOrder('newest');
    setFilterMode('include');
    setSelectedMethods([...ALL_METHODS]);
    setSelectedStatusGroups(ALL_STATUS_GROUPS.map(s => s.id));
    setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
    setTrafficSearchQuery('');
  };

  const applyQuickPreset = (preset: 'all' | '3rdparty' | 'embed' | 'errors' | 'slow' | 'stream' | 'today') => {
    setActiveQuickPreset(preset);
    if (preset === 'all') {
      handleResetFilters();
      return;
    }
    if (preset === 'embed') {
      setEmbedOnlyFilter(true);
      setErrorsOnly(false);
      setSlowOnly(false);
      setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
      return;
    }
    if (preset === '3rdparty') {
      setFilterMode('include');
      setSelectedCategories(['3rdparty']);
      setHideHeartbeat(true);
      setHideLog(true);
      setErrorsOnly(false);
      setSlowOnly(false);
      setEmbedOnlyFilter(false);
      setSelectedProvider('all');
    } else if (preset === 'errors') {
      setErrorsOnly(true);
      setSlowOnly(false);
      setEmbedOnlyFilter(false);
      setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
    } else if (preset === 'slow') {
      setSlowOnly(true);
      setErrorsOnly(false);
      setEmbedOnlyFilter(false);
      setSelectedLatencyFilter('slow');
      setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
    } else if (preset === 'stream') {
      setFilterMode('include');
      setSelectedCategories(['stream']);
      setHideHeartbeat(true);
      setHideLog(true);
      setErrorsOnly(false);
      setSlowOnly(false);
      setEmbedOnlyFilter(false);
    } else if (preset === 'today') {
      setTrafficDateFilter('today');
    }
  };

  const isFiltersCustomized = useMemo(() => {
    if (!hideHeartbeat || !hideLog || errorsOnly || slowOnly || embedOnlyFilter || selectedDeviceIdFilter || trafficSearchQuery.trim()) return true;
    if (selectedProvider !== 'all' || selectedLatencyFilter !== 'all' || selectedDeviceFilter !== 'all' || selectedBrowserFilter !== 'all' || trafficPayloadFilter !== 'all' || trafficDateFilter !== 'all' || trafficSortOrder !== 'newest') return true;
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
    embedOnlyFilter,
    selectedDeviceIdFilter,
    trafficSearchQuery, 
    selectedProvider,
    selectedLatencyFilter,
    selectedDeviceFilter,
    selectedBrowserFilter,
    trafficPayloadFilter,
    trafficDateFilter,
    trafficSortOrder,
    filterMode, 
    selectedMethods, 
    selectedStatusGroups, 
    selectedCategories
  ]);

  const filteredTraffic = useMemo(() => {
    let result = trafficLogs.filter(log => {
      const path = log.path || '';
      const method = (log.method || 'GET').toUpperCase();
      const statusGroup = getStatusGroup(log.statusCode);
      const category = categorizePath(path);

      // 0. Device ID and Embed Only filters
      if (selectedDeviceIdFilter && log.deviceId !== selectedDeviceIdFilter) {
        return false;
      }
      if (embedOnlyFilter && !log.isEmbed && !(log.path && log.path.includes('/embed')) && !(log.referer && log.referer.includes('/embed'))) {
        return false;
      }

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

      // 4. Third-Party Provider specific filter
      if (selectedProvider !== 'all') {
        const svc = getThirdPartyService(path).toLowerCase();
        if (selectedProvider === 'vlr' && !svc.includes('vlr')) return false;
        if (selectedProvider === 'trakt' && !svc.includes('trakt')) return false;
        if (selectedProvider === 'tmdb' && !svc.includes('tmdb')) return false;
        if (selectedProvider === 'opensubtitles' && !svc.includes('opensubtitles')) return false;
      }

      // 5. Granular Latency Filter
      const lat = log.latencyMs || 0;
      if (selectedLatencyFilter === 'fast' && lat >= 50) return false;
      if (selectedLatencyFilter === 'normal' && (lat < 50 || lat > 200)) return false;
      if (selectedLatencyFilter === 'slow' && (lat < 200 || lat > 1000)) return false;
      if (selectedLatencyFilter === 'veryslow' && lat <= 1000) return false;

      // 6. Device & Browser Filter
      if (selectedDeviceFilter !== 'all' && (log.device || 'Desktop') !== selectedDeviceFilter) return false;
      if (selectedBrowserFilter !== 'all' && (log.browser || 'Unknown') !== selectedBrowserFilter) return false;

      // 7. Payload Size Filter
      const b = log.bytes || 0;
      if (trafficPayloadFilter === 'small' && b >= 10240) return false;
      if (trafficPayloadFilter === 'medium' && (b < 10240 || b > 1048576)) return false;
      if (trafficPayloadFilter === 'large' && b <= 1048576) return false;

      // 8. Multi-Select Criteria (Method, Status, Category)
      if (filterMode === 'include') {
        if (!selectedMethods.includes(method)) return false;
        if (!selectedStatusGroups.includes(statusGroup)) return false;
        if (!selectedCategories.includes(category)) return false;
      } else {
        if (selectedMethods.length > 0 && selectedMethods.includes(method)) return false;
        if (selectedStatusGroups.length > 0 && selectedStatusGroups.includes(statusGroup)) return false;
        if (selectedCategories.length > 0 && selectedCategories.includes(category)) return false;
      }

      // 9. Search query with negation support ('!' prefix excludes)
      if (trafficSearchQuery.trim()) {
        const tokens = trafficSearchQuery.trim().toLowerCase().split(/\s+/);
        const searchTarget = `${path} ${method} ${log.ip || ''} ${log.browser || ''} ${log.statusCode} ${log.os || ''} ${log.device || ''} ${log.deviceId || ''} ${log.referer || ''} ${getThirdPartyService(path)}`.toLowerCase();

        for (const token of tokens) {
          if (token.startsWith('!')) {
            const neg = token.slice(1);
            if (neg && searchTarget.includes(neg)) {
              return false;
            }
          } else {
            if (!searchTarget.includes(token)) {
              return false;
            }
          }
        }
      }

      return true;
    });

    // Sort order
    if (trafficSortOrder === 'newest') {
      result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (trafficSortOrder === 'oldest') {
      result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (trafficSortOrder === 'slowest') {
      result.sort((a, b) => (b.latencyMs || 0) - (a.latencyMs || 0));
    } else if (trafficSortOrder === 'fastest') {
      result.sort((a, b) => (a.latencyMs || 0) - (b.latencyMs || 0));
    } else if (trafficSortOrder === 'largest') {
      result.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    }

    return result;
  }, [
    trafficLogs, 
    hideHeartbeat, 
    hideLog, 
    errorsOnly, 
    slowOnly, 
    embedOnlyFilter,
    selectedDeviceIdFilter,
    selectedProvider,
    selectedLatencyFilter,
    selectedDeviceFilter,
    selectedBrowserFilter,
    trafficPayloadFilter,
    selectedMethods, 
    selectedStatusGroups, 
    selectedCategories, 
    filterMode, 
    trafficSearchQuery,
    trafficSortOrder
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

  const activeTimelineData = useMemo(() => {
    return analytics?.activityData || analytics?.hourlyData || [];
  }, [analytics]);

  const maxTimelineRequests = useMemo(() => {
    if (!activeTimelineData || activeTimelineData.length === 0) return 10;
    const maxVal = Math.max(...activeTimelineData.map(h => h.requests));
    return maxVal > 0 ? maxVal : 10;
  }, [activeTimelineData]);

  const maxHourlyRequests = maxTimelineRequests;

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
          {/* Live Webhook Push Stream Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isLiveStreamConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            border: isLiveStreamConnected ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '20px',
            padding: '4px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            color: isLiveStreamConnected ? '#4ade80' : '#facc15'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isLiveStreamConnected ? '#22c55e' : '#eab308',
              boxShadow: isLiveStreamConnected ? '0 0 8px #22c55e' : 'none'
            }} />
            <span>{isLiveStreamConnected ? 'Live Webhook Stream' : 'Connecting Stream...'}</span>
          </div>

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
            <span>Admin {adminCallerIp ? `(${adminCallerIp})` : ''}</span>
          </div>

          {/* Stream / Polling Selector */}
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
            <span style={{ color: 'var(--text-muted, #94a3b8)', paddingLeft: '4px', fontSize: '0.72rem' }}>Mode:</span>
            {[
              { label: '⚡ Push (No Poll)', val: 0 },
              { label: '5s Poll', val: 5 },
              { label: '15s Poll', val: 15 }
            ].map(item => (
              <button
                key={item.label}
                onClick={() => setAutoRefreshInterval(item.val)}
                style={{
                  background: autoRefreshInterval === item.val ? 'var(--accent-color, #38bdf8)' : 'transparent',
                  color: autoRefreshInterval === item.val ? '#000' : 'var(--text-muted, #94a3b8)',
                  border: 'none',
                  padding: '2px 8px',
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
          { 
            id: 'devices', 
            label: `Visitors & Devices (${totalDevicesCount || devicesList.length})`, 
            icon: Laptop,
            badge: totalEmbedCallsCount ? `${totalEmbedCallsCount} embeds` : undefined
          },
          { 
            id: 'sessions', 
            label: `Open Sessions (${overview?.activeUsersCount ?? 0})`, 
            icon: Users,
            badge: overview?.activeUsersCount ? `${overview.activeUsersCount} live` : undefined
          },
          { 
            id: 'traffic', 
            label: 'Traffic Feed', 
            icon: Radio,
            badge: isStreamPaused ? 'Paused' : undefined
          },
          { 
            id: 'webhooks', 
            label: `Webhooks (${webhooksList.length})`, 
            icon: Send,
            badge: webhooksList.filter(w => w.enabled).length ? `${webhooksList.filter(w => w.enabled).length} live` : undefined
          },
          { 
            id: 'thirdparty', 
            label: `3rd Party APIs (${analytics?.thirdPartyStats?.totalRequests ?? 0})`, 
            icon: Zap,
            highlight: Boolean(analytics?.thirdPartyStats?.totalRequests && analytics.thirdPartyStats.totalRequests > 0)
          },
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
                borderBottom: isActive 
                  ? (tab.id === 'thirdparty' ? '2px solid #ec4899' : '2px solid var(--accent-color, #38bdf8)') 
                  : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive 
                  ? (tab.id === 'thirdparty' ? '#ec4899' : 'var(--accent-color, #38bdf8)') 
                  : 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.12s ease'
              }}
            >
              <Icon size={15} color={isActive ? (tab.id === 'thirdparty' ? '#ec4899' : 'var(--accent-color, #38bdf8)') : undefined} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: tab.id === 'devices' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: tab.id === 'devices' ? '#c084fc' : '#facc15',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
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
            {/* Chart 1: Multi-Timeframe Activity & Volume Chart */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* Header with Title and Timeframe Selector */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>Activity Timeline</h3>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--accent-color, #38bdf8)',
                      fontSize: '0.68rem',
                      fontWeight: 600
                    }}>
                      {activityTimeframe === 'day' ? 'Today (24 Hours)' :
                       activityTimeframe === 'custom_day' ? `Day: ${selectedActivityDate}` :
                       activityTimeframe === 'week' ? 'Past 7 Days' :
                       activityTimeframe === 'month' ? 'Past 30 Days' : 'Past 12 Months'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                    HTTP request volume, bandwidth & 3rd party API calls over time
                  </span>
                </div>

                {/* Timeframe Toggle Buttons */}
                <div style={{
                  display: 'flex',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  padding: '3px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                  gap: '2px'
                }}>
                  {[
                    { id: 'day', label: 'Today (24h)' },
                    { id: 'week', label: 'Week (7d)' },
                    { id: 'month', label: 'Month (30d)' },
                    { id: 'year', label: 'Months' },
                    { id: 'custom_day', label: 'Any Day 📅' }
                  ].map(tf => {
                    const isSelected = activityTimeframe === tf.id;
                    return (
                      <button
                        key={tf.id}
                        onClick={() => handleTimeframeChange(tf.id as any)}
                        style={{
                          backgroundColor: isSelected ? 'var(--accent-color, #38bdf8)' : 'transparent',
                          color: isSelected ? '#000' : 'var(--text-muted, #94a3b8)',
                          border: 'none',
                          borderRadius: '5px',
                          padding: '4px 9px',
                          fontSize: '0.72rem',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date Picker Bar & Active Days Quick Selector */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '7px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
                    <Calendar size={13} color="#38bdf8" />
                    <span>Select Specific Day:</span>
                  </div>
                  <input
                    type="date"
                    value={selectedActivityDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => handleActivityDateChange(e.target.value)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      color: 'var(--text-primary)',
                      fontSize: '0.72rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                  {analytics?.availableDates && analytics.availableDates.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>Active:</span>
                      {analytics.availableDates.slice(0, 4).map(d => (
                        <button
                          key={d.day}
                          onClick={() => handleActivityDateChange(d.day)}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: selectedActivityDate === d.day && activityTimeframe === 'custom_day' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                            border: selectedActivityDate === d.day && activityTimeframe === 'custom_day' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                            color: selectedActivityDate === d.day && activityTimeframe === 'custom_day' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
                            fontSize: '0.67rem',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          title={`${d.count} total requests, ${d.third_party_count} 3rd party`}
                        >
                          {d.day.slice(5)} ({d.count})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.7rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#38bdf8', borderRadius: '2px' }} />
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Total / Internal</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                    <span style={{ color: '#ec4899', fontWeight: 600 }}>3rd Party (VLR, etc.)</span>
                  </span>
                </div>
              </div>

              {/* Period Summary KPI Strip */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '8px',
                padding: '8px 10px',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Period Requests</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {analytics?.timeframeSummary?.totalRequests?.toLocaleString() ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>3rd Party Calls</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ec4899', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {analytics?.timeframeSummary?.thirdPartyRequests?.toLocaleString() ?? 0}
                    <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>({analytics?.timeframeSummary?.thirdPartyRatio || '0%'})</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Period Bandwidth</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#c084fc' }}>
                    {formatBytes(analytics?.timeframeSummary?.totalBytes ?? 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Peak Activity</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>
                    {analytics?.timeframeSummary?.peakActivity?.label || 'None'}
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)', marginLeft: '3px' }}>
                      ({analytics?.timeframeSummary?.peakActivity?.requests || 0})
                    </span>
                  </div>
                </div>
              </div>

              {/* Bar Chart Container */}
              <div style={{ height: '210px', display: 'flex', alignItems: 'flex-end', gap: activeTimelineData.length > 20 ? '4px' : '8px', paddingBottom: '22px', position: 'relative' }}>
                {activeTimelineData && activeTimelineData.length > 0 ? (
                  activeTimelineData.map((item, idx) => {
                    const totalReqs = item.requests || 0;
                    const tpReqs = item.thirdPartyRequests || 0;
                    const nonTpReqs = Math.max(0, totalReqs - tpReqs);

                    const heightPercent = totalReqs > 0 ? Math.max(6, Math.min(100, Math.round((totalReqs / maxTimelineRequests) * 100))) : 0;
                    const tpSharePercent = totalReqs > 0 ? (tpReqs / totalReqs) : 0;

                    const tooltipText = `${item.label} (${item.sublabel || item.date || ''}):\n• Total Requests: ${totalReqs}\n• 3rd Party APIs: ${tpReqs}\n• Bandwidth: ${formatBytes(item.bytes)}\n• Visitors: ${item.activeUsers}`;

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
                        {totalReqs > 0 ? (
                          <div 
                            title={tooltipText}
                            style={{
                              width: '100%',
                              maxWidth: activeTimelineData.length > 24 ? '18px' : '32px',
                              height: `${heightPercent}%`,
                              borderRadius: '3px 3px 0 0',
                              transition: 'height 0.3s ease',
                              cursor: 'pointer',
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              overflow: 'hidden'
                            }}
                          >
                            {/* 3rd Party portion (pink/magenta) */}
                            {tpReqs > 0 && (
                              <div style={{
                                width: '100%',
                                height: `${Math.round(tpSharePercent * 100)}%`,
                                backgroundColor: '#ec4899',
                                borderBottom: nonTpReqs > 0 ? '1px solid rgba(0,0,0,0.3)' : 'none'
                              }} />
                            )}
                            {/* Internal portion (cyan) */}
                            {nonTpReqs > 0 && (
                              <div style={{
                                width: '100%',
                                flex: 1,
                                background: 'linear-gradient(180deg, #38bdf8 0%, rgba(56, 189, 248, 0.4) 100%)'
                              }} />
                            )}

                            {totalReqs > 0 && activeTimelineData.length <= 24 && (
                              <span style={{
                                position: 'absolute',
                                top: '-18px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '0.62rem',
                                color: 'var(--text-muted, #94a3b8)',
                                fontWeight: 700
                              }}>
                                {totalReqs}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            width: '100%',
                            maxWidth: '12px',
                            height: '3px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '2px'
                          }} />
                        )}

                        <span style={{
                          position: 'absolute',
                          bottom: '0',
                          fontSize: activeTimelineData.length > 20 ? '0.58rem' : '0.65rem',
                          color: 'var(--text-muted, #94a3b8)',
                          whiteSpace: 'nowrap'
                        }}>
                          {activeTimelineData.length > 24 && idx % 2 !== 0 ? '' : item.label}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ width: '100%', textAlign: 'center', alignSelf: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem' }}>
                    Collecting activity telemetry for selected timeframe...
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
            {/* 3rd Party APIs Breakdown */}
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: '#ec4899' }}>
                  <Zap size={15} color="#ec4899" />
                  3rd Party Integrations
                </h4>
                <button
                  onClick={() => setActiveTab('thirdparty')}
                  style={{
                    fontSize: '0.7rem',
                    color: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    border: '1px solid rgba(236, 72, 153, 0.3)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  View Details &rarr;
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                {analytics?.thirdPartyStats?.services && analytics.thirdPartyStats.services.length > 0 ? (
                  analytics.thirdPartyStats.services.map((svc) => (
                    <div key={svc.name || svc.service} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ec4899' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{svc.name || svc.service}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#ec4899', fontWeight: 700 }}>
                          {svc.requests.toLocaleString()} reqs
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                          ({formatBytes(svc.bytes)})
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', textAlign: 'center', padding: '8px 0' }}>
                    No 3rd party calls logged in this period
                  </div>
                )}
                {analytics?.thirdPartyStats?.totalRequests ? (
                  <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                    <span>Total 3rd party share:</span>
                    <span style={{ color: '#ec4899', fontWeight: 700 }}>{analytics?.timeframeSummary?.thirdPartyRatio || '0%'}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* SaaS Trend Charts (Area Graph, Top Geographies, Platform Breakdown, Status Codes) */}
          <SaaSTrendCharts 
            activityData={activeTimelineData || []}
            timeframe={activityTimeframe}
            browserBreakdown={analytics?.browserBreakdown || []}
            osBreakdown={analytics?.osBreakdown || []}
            deviceBreakdown={analytics?.deviceBreakdown || []}
            devicesList={devicesList}
            trafficLogs={trafficLogs}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: VISITED DEVICES & INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === 'devices' && (
        <VisitedDevicesTab
          devicesList={devicesList}
          totalDevicesCount={totalDevicesCount}
          totalEmbedCallsCount={totalEmbedCallsCount}
          topEmbedReferrers={topEmbedReferrers}
          searchQuery={deviceSearchQuery}
          onSearchChange={setDeviceSearchQuery}
          sortBy={deviceSortBy}
          onSortChange={setDeviceSortBy}
          filter={deviceFilter}
          onFilterChange={setDeviceFilter}
          onInspectDevice={handleInspectDevice}
          onFilterDeviceTraffic={handleFilterByDevice}
          onBlockIp={handleBlockIp}
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: 3RD PARTY EXTERNAL APIS & SCRAPERS */}
      {/* ========================================================================= */}
      {activeTab === 'thirdparty' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Card */}
          <div style={{
            backgroundColor: 'var(--surface, #1e293b)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={20} color="#ec4899" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Third-Party APIs & Scrapers</h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(236, 72, 153, 0.15)',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                  color: '#ec4899',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  Upstream Telemetry
                </span>
              </div>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.76rem' }}>
                Performance tracking, latency metrics, and health tests for external services: VLR.gg (Esports Scraper), Trakt.tv, TheMovieDB, and OpenSubtitles.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handlePingThirdParty}
                disabled={thirdPartyPingLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(236, 72, 153, 0.15)',
                  border: '1px solid rgba(236, 72, 153, 0.4)',
                  color: '#ec4899',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: thirdPartyPingLoading ? 'not-allowed' : 'pointer',
                  opacity: thirdPartyPingLoading ? 0.7 : 1,
                  transition: 'all 0.15s ease'
                }}
                title="Test live connectivity and response times of upstream providers"
              >
                <RefreshCw size={13} className={thirdPartyPingLoading ? 'animate-spin' : ''} />
                <span>{thirdPartyPingLoading ? 'Pinging Providers...' : 'Ping Providers Now'}</span>
              </button>

              <button
                onClick={() => {
                  setSelectedCategories(['3rdparty']);
                  setSelectedProvider('all');
                  setActiveTab('traffic');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Radio size={13} color="#38bdf8" />
                <span>View in Traffic Feed</span>
              </button>
            </div>
          </div>

          {/* Top KPI Ribbon */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1rem 1.15rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Total 3rd Party Calls</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ec4899', marginTop: '4px' }}>
                {analytics?.thirdPartyStats?.totalRequests?.toLocaleString() ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                {analytics?.timeframeSummary?.thirdPartyRatio || '0%'} of all requests
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1rem 1.15rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Data Transferred</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
                {formatBytes(analytics?.thirdPartyStats?.totalBytes ?? 0)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                Upstream payload volume
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1rem 1.15rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Average Latency</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24', marginTop: '4px' }}>
                {analytics?.thirdPartyStats?.avgLatencyMs ?? 0} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>ms</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                Scraping & proxy round-trip
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface, #1e293b)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
              borderRadius: '10px',
              padding: '1rem 1.15rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600 }}>Active Endpoints</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                {analytics?.thirdPartyStats?.endpoints?.length ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                Unique proxied paths
              </div>
            </div>
          </div>

          {/* Upstream Providers Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem'
          }}>
            {[
              {
                id: 'vlr',
                name: 'VLR.gg',
                tag: 'Esports Scraper',
                desc: 'Scrapes live match scores, tournament brackets, and team telemetry from vlr.gg',
                color: '#ec4899',
                pingName: 'VLR.gg (Esports Scraper)'
              },
              {
                id: 'trakt',
                name: 'Trakt.tv',
                tag: 'Cloud Sync & Scrobble',
                desc: 'Synchronizes watch history, ratings, and playback scrobbling with Trakt cloud',
                color: '#ef4444',
                pingName: 'Trakt.tv (Scrobbler & Sync)'
              },
              {
                id: 'tmdb',
                name: 'TheMovieDB',
                tag: 'Metadata & Posters',
                desc: 'Fetches high-resolution poster art, episode titles, cast bios, and metadata',
                color: '#38bdf8',
                pingName: 'TheMovieDB (Metadata & Posters)'
              },
              {
                id: 'opensubtitles',
                name: 'OpenSubtitles',
                tag: 'Subtitle Downloader',
                desc: 'Multi-language subtitle search, synchronizations, and VTT / SRT downloads',
                color: '#10b981',
                pingName: 'OpenSubtitles'
              }
            ].map((provider) => {
              const svcStats = analytics?.thirdPartyStats?.services?.find(
                s => (s.name || s.service || '').toLowerCase().includes(provider.id)
              );
              const pingResult = thirdPartyPingResults?.find(
                p => p.name.toLowerCase().includes(provider.id)
              );

              return (
                <div key={provider.id} style={{
                  backgroundColor: 'var(--surface, #1e293b)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {/* Provider Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{provider.name}</span>
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: `${provider.color}18`,
                          border: `1px solid ${provider.color}40`,
                          color: provider.color
                        }}>
                          {provider.tag}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', lineHeight: '1.3' }}>
                        {provider.desc}
                      </p>
                    </div>

                    {/* Ping Badge if available */}
                    {pingResult && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        backgroundColor: pingResult.status === 'online' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: pingResult.status === 'online' ? '#4ade80' : '#f87171',
                        border: `1px solid ${pingResult.status === 'online' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: pingResult.status === 'online' ? '#22c55e' : '#ef4444' }} />
                        {pingResult.status === 'online' ? `${pingResult.latencyMs}ms` : 'Error'}
                      </span>
                    )}
                  </div>

                  {/* Provider Metrics Strip */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    padding: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Requests</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {svcStats?.requests?.toLocaleString() ?? 0}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Bandwidth</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>
                        {formatBytes(svcStats?.bytes ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Avg Latency</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                        {svcStats?.avgLatencyMs ? `${svcStats.avgLatencyMs}ms` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Action Link */}
                  <button
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setSelectedCategories(['3rdparty']);
                      setActiveTab('traffic');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: `${provider.color}12`,
                      border: `1px solid ${provider.color}35`,
                      color: provider.color,
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>Filter {provider.name} in Traffic Feed</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Endpoints Detailed Table */}
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
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>External Endpoint Invocations</h3>
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.74rem' }}>
                  Granular performance per 3rd-party proxied route
                </p>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                {analytics?.thirdPartyStats?.endpoints?.length ?? 0} endpoints tracked
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    color: 'var(--text-muted, #94a3b8)',
                    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}>
                    <th style={{ padding: '9px 14px' }}>Service</th>
                    <th style={{ padding: '9px 14px' }}>Proxied Endpoint</th>
                    <th style={{ padding: '9px 14px' }}>Requests</th>
                    <th style={{ padding: '9px 14px' }}>Data Volume</th>
                    <th style={{ padding: '9px 14px' }}>Avg Latency</th>
                    <th style={{ padding: '9px 14px' }}>Errors</th>
                    <th style={{ padding: '9px 14px' }}>Last Invoked</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics?.thirdPartyStats?.endpoints && analytics.thirdPartyStats.endpoints.length > 0 ? (
                    analytics.thirdPartyStats.endpoints.map((ep) => {
                      const isVlr = ep.service.toLowerCase().includes('vlr');
                      const serviceColor = isVlr ? '#ec4899' : ep.service.toLowerCase().includes('trakt') ? '#ef4444' : '#38bdf8';
                      const isHighLatency = (ep.avgLatencyMs || 0) > 1000;

                      return (
                        <tr key={ep.path} style={{
                          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.04))',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: `${serviceColor}18`,
                              border: `1px solid ${serviceColor}35`,
                              color: serviceColor,
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}>
                              {ep.service}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ep.path}</span>
                          </td>
                          <td style={{ padding: '9px 14px', fontWeight: 600 }}>
                            {ep.requests.toLocaleString()}
                          </td>
                          <td style={{ padding: '9px 14px', color: '#c084fc' }}>
                            {formatBytes(ep.bytes)}
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{
                              color: isHighLatency ? '#f87171' : (ep.avgLatencyMs > 300 ? '#fbbf24' : '#4ade80'),
                              fontWeight: 600
                            }}>
                              {ep.avgLatencyMs} ms
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            {ep.errorCount > 0 ? (
                              <span style={{ color: '#f87171', fontWeight: 600 }}>{ep.errorCount}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted, #94a3b8)' }}>0</span>
                            )}
                          </td>
                          <td style={{ padding: '9px 14px', color: 'var(--text-muted, #94a3b8)', fontSize: '0.74rem' }}>
                            {ep.lastCalled ? String(ep.lastCalled).slice(0, 19).replace('T', ' ') : '—'}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setTrafficSearchQuery(ep.path);
                                setSelectedCategories(['3rdparty']);
                                setActiveTab('traffic');
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                color: 'var(--accent-color, #38bdf8)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              title="Filter Traffic feed to this endpoint"
                            >
                              Inspect Traffic
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                        No third-party endpoint invocations captured for the current timeframe.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: OPEN SESSIONS & LIVE VISITORS */}
      {/* ========================================================================= */}
      {activeTab === 'sessions' && (
        <OpenSessionsTab
          sessions={overview?.activeUsers || []}
          onTerminateSession={handleTerminateSession}
          onFilterSessionLogs={handleFilterSessionLogs}
          onFilterDeviceTraffic={handleFilterByDevice}
          onBlockIp={handleBlockIp}
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
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

            {/* Quick Presets Strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 700, textTransform: 'uppercase', marginRight: '4px' }}>
                Presets:
              </span>
              {[
                { id: 'all', label: 'All Traffic' },
                { id: '3rdparty', label: '⚡ 3rd Party (VLR/Trakt)', color: '#ec4899' },
                { id: 'errors', label: '⚠️ Errors (4xx/5xx)', color: '#f87171' },
                { id: 'slow', label: '⏱️ Slow (>200ms)', color: '#fbbf24' },
                { id: 'stream', label: '🎬 Media Streams', color: '#c084fc' },
                { id: 'today', label: '📅 Today Only', color: '#38bdf8' }
              ].map(p => {
                const isActive = activeQuickPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyQuickPreset(p.id as any)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: isActive ? 700 : 500,
                      backgroundColor: isActive 
                        ? (p.color ? `${p.color}25` : 'rgba(56, 189, 248, 0.2)')
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isActive 
                        ? (p.color ? `1px solid ${p.color}60` : '1px solid rgba(56, 189, 248, 0.4)')
                        : '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                      color: isActive ? (p.color || '#38bdf8') : 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Granular Filters & Scoping Strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
              paddingTop: '2px'
            }}>
              {/* Selectors Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Provider Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <select
                    value={selectedProvider}
                    onChange={e => {
                      setSelectedProvider(e.target.value);
                      setActiveQuickPreset('all');
                    }}
                    style={{
                      backgroundColor: selectedProvider !== 'all' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(0, 0, 0, 0.25)',
                      border: selectedProvider !== 'all' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                      color: selectedProvider !== 'all' ? '#ec4899' : 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      fontSize: '0.74rem',
                      fontWeight: selectedProvider !== 'all' ? 700 : 500,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    title="Filter by third-party upstream provider"
                  >
                    <option value="all">🌐 All Providers</option>
                    <option value="vlr">⚡ VLR.gg (Esports Scraper)</option>
                    <option value="trakt">📺 Trakt.tv (Sync)</option>
                    <option value="tmdb">🎬 TheMovieDB (Posters)</option>
                    <option value="opensubtitles">💬 OpenSubtitles</option>
                  </select>
                </div>

                {/* Date Filter & Custom Day */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <select
                    value={trafficDateFilter}
                    onChange={e => {
                      setTrafficDateFilter(e.target.value as any);
                      setActiveQuickPreset('all');
                    }}
                    style={{
                      backgroundColor: trafficDateFilter !== 'all' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0, 0, 0, 0.25)',
                      border: trafficDateFilter !== 'all' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                      color: trafficDateFilter !== 'all' ? '#38bdf8' : 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      fontSize: '0.74rem',
                      fontWeight: trafficDateFilter !== 'all' ? 700 : 500,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    title="Filter database traffic by day"
                  >
                    <option value="all">📅 All Dates</option>
                    <option value="today">📅 Today</option>
                    <option value="yesterday">📅 Yesterday</option>
                    <option value="custom">📅 Specific Day...</option>
                  </select>

                  {trafficDateFilter === 'custom' && (
                    <input
                      type="date"
                      value={trafficCustomDate}
                      onChange={e => setTrafficCustomDate(e.target.value)}
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8',
                        borderRadius: '6px',
                        padding: '4px 6px',
                        fontSize: '0.74rem',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                      title="Select specific calendar day to query"
                    />
                  )}
                </div>

                {/* Latency Filter */}
                <select
                  value={selectedLatencyFilter}
                  onChange={e => {
                    setSelectedLatencyFilter(e.target.value as any);
                    setActiveQuickPreset('all');
                  }}
                  style={{
                    backgroundColor: selectedLatencyFilter !== 'all' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 0, 0, 0.25)',
                    border: selectedLatencyFilter !== 'all' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    color: selectedLatencyFilter !== 'all' ? '#fbbf24' : 'var(--text-primary)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    fontWeight: selectedLatencyFilter !== 'all' ? 700 : 500,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  title="Filter by response latency"
                >
                  <option value="all">⏱️ All Latencies</option>
                  <option value="fast">⚡ Fast (&lt; 50ms)</option>
                  <option value="normal">⏱️ Normal (50 - 200ms)</option>
                  <option value="slow">🐢 Slow (200 - 1000ms)</option>
                  <option value="veryslow">⚠️ Very Slow (&gt; 1000ms)</option>
                </select>

                {/* Device Filter */}
                <select
                  value={selectedDeviceFilter}
                  onChange={e => setSelectedDeviceFilter(e.target.value)}
                  style={{
                    backgroundColor: selectedDeviceFilter !== 'all' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0, 0, 0, 0.25)',
                    border: selectedDeviceFilter !== 'all' ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    color: selectedDeviceFilter !== 'all' ? '#c084fc' : 'var(--text-primary)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    fontWeight: selectedDeviceFilter !== 'all' ? 700 : 500,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  title="Filter by client device type"
                >
                  <option value="all">📱 All Devices</option>
                  <option value="Desktop">💻 Desktop</option>
                  <option value="Mobile">📱 Mobile</option>
                  <option value="Tablet">📟 Tablet</option>
                </select>

                {/* Sort Order */}
                <select
                  value={trafficSortOrder}
                  onChange={e => setTrafficSortOrder(e.target.value as any)}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    color: 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  title="Order results by criteria"
                >
                  <option value="newest">Sort: Newest First</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="slowest">Sort: Slowest Latency</option>
                  <option value="fastest">Sort: Fastest Latency</option>
                  <option value="largest">Sort: Largest Payload</option>
                </select>

                {/* Limit selector */}
                <select
                  value={trafficLimit}
                  onChange={e => setTrafficLimit(Number(e.target.value))}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    color: 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  title="Rows fetched from database"
                >
                  <option value={50}>50 rows</option>
                  <option value={150}>150 rows</option>
                  <option value={300}>300 rows</option>
                  <option value={500}>500 rows</option>
                  <option value={1000}>1000 rows</option>
                </select>
              </div>

              {/* Quick noise reduction toggles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Hide Heartbeats */}
                <button
                  onClick={() => setHideHeartbeat(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: hideHeartbeat ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: hideHeartbeat ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: hideHeartbeat ? '#4ade80' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Hide telemetry polling from /api/heartbeat"
                >
                  {hideHeartbeat ? <Check size={10} strokeWidth={3} /> : <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
                  Heartbeats
                </button>

                {/* Hide Logs */}
                <button
                  onClick={() => setHideLog(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: hideLog ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: hideLog ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: hideLog ? '#4ade80' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Hide client event logs from /api/log"
                >
                  {hideLog ? <Check size={10} strokeWidth={3} /> : <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
                  Logs
                </button>

                {/* Errors Only */}
                <button
                  onClick={() => setErrorsOnly(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: errorsOnly ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: errorsOnly ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: errorsOnly ? '#f87171' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  title="Show only 4xx and 5xx responses"
                >
                  <AlertTriangle size={11} />
                  Errors
                </button>

                {/* Slow Only */}
                <button
                  onClick={() => setSlowOnly(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: slowOnly ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: slowOnly ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    color: slowOnly ? '#fbbf24' : 'var(--text-muted, #94a3b8)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.71rem',
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
              <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px', maxWidth: '340px' }}>
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
                          {isThirdPartyPath(log.path) ? (
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(236, 72, 153, 0.18)',
                              border: '1px solid rgba(236, 72, 153, 0.4)',
                              color: '#ec4899',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}>
                              ⚡ {getThirdPartyService(log.path)}
                            </span>
                          ) : (
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
                          )}
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {log.path}
                        </td>
                        <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                          {(log.latencyMs || 0) > 1000 ? (
                            <span style={{ color: '#f87171', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span>{Math.round(log.latencyMs)} ms</span>
                              <span style={{ fontSize: '0.62rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: '1px 3px', borderRadius: '3px' }}>SLOW</span>
                            </span>
                          ) : (log.latencyMs || 0) > 200 ? (
                            <span style={{ color: '#fbbf24', fontWeight: 600 }}>{Math.round(log.latencyMs)} ms</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>{Math.round(log.latencyMs || 0)} ms</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#c084fc', whiteSpace: 'nowrap' }}>
                          {formatBytes(log.bytes || 0)}
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.ip || '—'}</span>
                          {log.device && (
                            <span style={{
                              marginLeft: '6px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor: log.device === 'Desktop' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(168, 85, 247, 0.12)',
                              color: log.device === 'Desktop' ? 'var(--text-muted, #94a3b8)' : '#c084fc',
                              fontSize: '0.64rem',
                              fontWeight: 600
                            }}>
                              {log.device}
                            </span>
                          )}
                          {log.browser && <span style={{ marginLeft: '4px', opacity: 0.75, fontSize: '0.72rem' }}>({log.browser})</span>}
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

      {/* ========================================================================= */}
      {/* TAB: WEBHOOKS CONSOLE & DISPATCH AUDIT */}
      {/* ========================================================================= */}
      {activeTab === 'webhooks' && (
        <WebhooksTab
          webhooks={webhooksList}
          deliveries={webhookDeliveries}
          onCreateWebhook={handleCreateWebhook}
          onUpdateWebhook={handleUpdateWebhook}
          onDeleteWebhook={handleDeleteWebhook}
          onTestWebhook={handleTestWebhook}
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISITOR DEVICE DOSSIER & INTELLIGENCE INSPECTION */}
      {/* ========================================================================= */}
      {selectedDeviceDetail && (
        <DeviceDetailModal
          device={selectedDeviceDetail}
          logs={selectedDeviceLogs}
          loading={deviceDetailLoading}
          onClose={() => setSelectedDeviceDetail(null)}
          onFilterDeviceLogs={handleFilterByDevice}
          onBlockIp={handleBlockIp}
          onCopy={handleCopy}
          copiedId={copiedId}
        />
      )}
    </div>
  );
};
