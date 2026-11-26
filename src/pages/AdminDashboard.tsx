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
import { EmbedProvidersTab } from '../components/admin/EmbedProvidersTab';

// Real-Time Event Portal Components
import { useAdminRealtime, type RealtimeEnvelope } from '../components/admin/realtime/useAdminRealtime';
import { ConnectionStatus } from '../components/admin/realtime/ConnectionStatus';
import { EventToastContainer, type ToastItem } from '../components/admin/realtime/EventToast';
import { NotificationCenter, type AlertItem } from '../components/admin/realtime/NotificationCenter';
import { CommandPalette } from '../components/admin/realtime/CommandPalette';
import { AlertRuleEditor, type AlertRule } from '../components/admin/realtime/AlertRuleEditor';
import { BlockListManager, type BlockListItem, type AutoBlockSuggestion, type AdminSession } from '../components/admin/realtime/BlockListManager';
import { AuditLogViewer, type AuditLogEntry } from '../components/admin/realtime/AuditLogViewer';
import { SessionList, type PlaybackSession } from '../components/admin/realtime/SessionList';
import { ErrorGroups, type ErrorGroupItem } from '../components/admin/realtime/ErrorGroups';
import { PlaybackQuality } from '../components/admin/realtime/PlaybackQuality';
import { ContentInsights } from '../components/admin/realtime/ContentInsights';
import { GeoAnalytics } from '../components/admin/realtime/GeoAnalytics';
import { InfraHealth } from '../components/admin/realtime/InfraHealth';
import { MaintenanceBroadcast } from '../components/admin/realtime/MaintenanceBroadcast';
import { DataRetention } from '../components/admin/realtime/DataRetention';
import { ThirdPartyMonitor } from '../components/admin/realtime/ThirdPartyMonitor';
import { TrafficTools } from '../components/admin/realtime/TrafficTools';
import { LiveChart } from '../components/admin/realtime/LiveChart';
import { InboundWebhookModal } from '../components/admin/realtime/InboundWebhookModal';
import { AdminDashboardSkeleton } from '../components/admin/realtime/AdminSkeletons';

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
  const [activeTab, setActiveTab] = useState<
    'overview' | 'devices' | 'sessions' | 'traffic' | 'webhooks' | 'thirdparty' | 'embeds' | 'users' |
    'alerts' | 'security' | 'playback' | 'content' | 'geo' | 'errors' | 'infra' | 'audit' | 'system'
  >('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [webhooksList, setWebhooksList] = useState<Webhook[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);

  // Real-Time Portal Extended State
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  const [incidentTimeline, setIncidentTimeline] = useState<any[]>([]);
  const [blockList, setBlockList] = useState<BlockListItem[]>([]);
  const [autoBlockSuggestions, setAutoBlockSuggestions] = useState<AutoBlockSuggestion[]>([]);
  const [adminSessions, setAdminSessions] = useState<AdminSession[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [playbackQualityMetrics, setPlaybackQualityMetrics] = useState<any>({
    summary: { avgStartupTimeMs: 445, avgBufferingRatioPct: 0.18, avgBitrateKbps: 9420, playbackErrorRatePct: 0.65, totalSessionsTracked: 12480 },
    byTitle: [], byDevice: [], byRegion: []
  });
  const [contentInsights, setContentInsights] = useState<any>({
    topTitles: [], topEpisodes: [], audienceBreakdown: { newVisitorsPct: 34, returningVisitorsPct: 66, avgDailyWatchTimeMinutes: 72 }, retentionCohorts: []
  });
  const [geoStats, setGeoStats] = useState<any>({ countries: [], cities: [] });
  const [errorGroups, setErrorGroups] = useState<ErrorGroupItem[]>([]);
  const [infraStatus, setInfraStatus] = useState<any>({ postgres: {}, redis: {}, reverseProxy: {}, system: {} });
  const [maintenanceConfig, setMaintenanceConfig] = useState<any>({ enabled: false, message: 'Platform maintenance' });
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dataRetentionConfig, setDataRetentionConfig] = useState<any>({ rawLogsRetentionDays: 30, aggregatesRetentionDays: 365, autoPruneEnabled: true });
  
  // Real-Time UI Controls & Modals
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [inboundModalOpen, setInboundModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [bufferedTraffic, setBufferedTraffic] = useState<any[]>([]);
  const [adminRole, setAdminRole] = useState<'owner' | 'admin' | 'viewer'>('owner');
  const [trafficViewMode, setTrafficViewMode] = useState<'inspector' | 'classic'>('inspector');

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

  const normalizedTrafficRows = useMemo(() => {
    return trafficLogs.map((l: any) => ({
      id: String(l.id || `${l.timestamp}-${Math.random()}`),
      method: l.method || 'GET',
      path: l.path || '/',
      status: l.statusCode || l.status || 200,
      latencyMs: l.latencyMs || l.latency_ms || 0,
      bytes: l.bytes || l.bytes_transferred || 0,
      ip: l.ip || '127.0.0.1',
      country: l.country || l.geo?.country,
      city: l.city || l.geo?.city,
      timestamp: typeof l.timestamp === 'number' ? new Date(l.timestamp).toISOString() : (l.timestamp || new Date().toISOString()),
      userAgent: l.userAgent || `${l.browser || ''} ${l.os || ''}`.trim() || undefined,
      headers: l.headers,
      body: l.body
    }));
  }, [trafficLogs]);

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
      const authHeaders = {
        'x-admin-token': adminToken,
        'Authorization': `Bearer ${adminToken}`
      };

      // 1. One-Shot Snapshot Endpoint (Loads all initial metrics, rows and tool states)
      try {
        const snapRes = await fetch('/api/admin/snapshot', { headers: authHeaders });
        if (snapRes.ok) {
          const snap = await snapRes.json();
          if (snap.overview) setOverview(snap.overview);
          if (snap.adminIp) setAdminCallerIp(snap.adminIp);
          if (Array.isArray(snap.trafficLogs)) setTrafficLogs(snap.trafficLogs);
          if (Array.isArray(snap.devicesList)) {
            setDevicesList(snap.devicesList);
            setTotalDevicesCount(snap.devicesList.length);
          }
          if (Array.isArray(snap.webhooks)) setWebhooksList(snap.webhooks);
          if (Array.isArray(snap.webhookDeliveries)) setWebhookDeliveries(snap.webhookDeliveries);
          if (Array.isArray(snap.alertRules)) setAlertRules(snap.alertRules);
          if (Array.isArray(snap.activeAlerts)) setActiveAlerts(snap.activeAlerts);
          if (typeof snap.unreadAlertsCount === 'number') setUnreadAlertsCount(snap.unreadAlertsCount);
          if (Array.isArray(snap.incidentTimeline)) setIncidentTimeline(snap.incidentTimeline);
          if (Array.isArray(snap.blockList)) setBlockList(snap.blockList);
          if (Array.isArray(snap.autoBlockSuggestions)) setAutoBlockSuggestions(snap.autoBlockSuggestions);
          if (Array.isArray(snap.adminSessions)) setAdminSessions(snap.adminSessions);
          if (Array.isArray(snap.auditLogs)) setAuditLogs(snap.auditLogs);
          if (snap.playbackQuality) setPlaybackQualityMetrics(snap.playbackQuality);
          if (snap.contentInsights) setContentInsights(snap.contentInsights);
          if (snap.geoStats) setGeoStats(snap.geoStats);
          if (Array.isArray(snap.errorGroups)) setErrorGroups(snap.errorGroups);
          if (snap.infra) setInfraStatus(snap.infra);
          if (snap.maintenance) setMaintenanceConfig(snap.maintenance);
          if (Array.isArray(snap.announcements)) setAnnouncements(snap.announcements);
          if (snap.dataRetention) setDataRetentionConfig(snap.dataRetention);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch (e) {}

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

  // Real-Time Event Dispatcher (Zero polling, fully event-driven)
  const handleRealtimeEvent = useCallback((envelope: RealtimeEnvelope) => {
    const { type, data } = envelope;

    if (type === 'request.logged' || type === 'traffic.logged' || type === 'traffic_log') {
      const logItem = data;
      if (isStreamPaused) {
        setBufferedTraffic(prev => [logItem, ...prev.slice(0, 499)]);
      } else {
        setTrafficLogs(prev => {
          if (prev.some(l => l.id === logItem.id)) return prev;
          return [logItem, ...prev.slice(0, 499)];
        });
      }
      setOverview(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          totalRequests: (prev.totalRequests || 0) + 1,
          totalBytes: (prev.totalBytes || 0) + (logItem.bytes || logItem.bytesTransferred || 2048)
        };
      });
    } else if (type === 'visitor.seen' || type === 'device.updated' || type === 'device_update') {
      setDevicesList(prev => {
        const idx = prev.findIndex(d => d.deviceId === data.deviceId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            ...data,
            totalRequests: (updated[idx].totalRequests || 0) + 1,
            lastSeen: new Date().toISOString()
          };
          return updated;
        }
        return [data, ...prev];
      });
    } else if (type === 'session.opened' || type === 'session_update') {
      setOverview(prev => {
        if (!prev) return prev;
        const idx = prev.activeUsers.findIndex(u => u.sessionId === data.sessionId);
        let updated: ActiveUser[];
        if (idx >= 0) {
          updated = [...prev.activeUsers];
          updated[idx] = { ...updated[idx], ...data };
        } else {
          updated = [data, ...prev.activeUsers];
        }
        return { ...prev, activeUsersCount: updated.length, activeUsers: updated };
      });
    } else if (type === 'session.closed') {
      setOverview(prev => {
        if (!prev) return prev;
        const updated = prev.activeUsers.filter(u => u.sessionId !== data.sessionId);
        return { ...prev, activeUsersCount: updated.length, activeUsers: updated };
      });
    } else if (type === 'alert.triggered') {
      setActiveAlerts(prev => [data, ...prev.slice(0, 99)]);
      setUnreadAlertsCount(prev => prev + 1);
      setToasts(prev => [
        {
          id: data.id || `t_${Date.now()}`,
          title: data.title || 'Security / System Alert',
          message: data.message || '',
          severity: data.severity || 'warning',
          timestamp: data.createdAt || new Date().toISOString()
        },
        ...prev.slice(0, 4)
      ]);
    } else if (type === 'alert.acknowledged') {
      setActiveAlerts(prev => prev.map(a => a.id === data.id ? { ...a, status: 'acknowledged' } : a));
      setUnreadAlertsCount(prev => Math.max(0, prev - 1));
    } else if (type === 'alert.snoozed') {
      setActiveAlerts(prev => prev.map(a => a.id === data.id ? { ...a, status: 'snoozed' } : a));
    } else if (type === 'webhook.delivery') {
      setWebhookDeliveries(prev => [data, ...prev.slice(0, 99)]);
    } else if (type === 'ip.blocked') {
      setBlockList(prev => [data, ...prev]);
    } else if (type === 'ip.unblocked') {
      setBlockList(prev => prev.filter(b => b.id !== data.id && b.value !== data.value));
    } else if (type === 'security.audit') {
      setAuditLogs(prev => [data, ...prev.slice(0, 199)]);
    } else if (type === 'error.logged') {
      setErrorGroups(prev => {
        const idx = prev.findIndex(e => e.fingerprint === data.fingerprint);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = data;
          return updated;
        }
        return [data, ...prev];
      });
    } else if (type === 'maintenance.changed') {
      setMaintenanceConfig(data);
    }
  }, [isStreamPaused]);

  const flushBufferedEvents = useCallback(() => {
    if (bufferedTraffic.length === 0) return;
    setTrafficLogs(prev => {
      const existingIds = new Set(prev.map(l => l.id));
      const newItems = bufferedTraffic.filter(l => !existingIds.has(l.id));
      return [...newItems, ...prev].slice(0, 500);
    });
    setBufferedTraffic([]);
  }, [bufferedTraffic]);

  const realtimeTopics = useMemo(() => ['*'], []);
  const handleBatchRealtimeEvents = useCallback((batch: RealtimeEnvelope[]) => {
    batch.forEach(handleRealtimeEvent);
  }, [handleRealtimeEvent]);

  const {
    connectionState,
    reconnectAttempt,
    nextRetrySeconds,
    missedEventsApplied,
    isCatchingUp,
    manualReconnect
  } = useAdminRealtime({
    token: isAuthenticated ? adminToken : null,
    topics: realtimeTopics,
    onEvent: handleRealtimeEvent,
    onBatchEvents: handleBatchRealtimeEvents
  });

  // Handler: Save Alert Rule
  const handleSaveAlertRule = async (rule: Partial<AlertRule>) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify(rule)
      });
      const data = await res.json();
      if (res.ok && data.rule) {
        setAlertRules(prev => {
          const idx = prev.findIndex(r => r.id === data.rule.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = data.rule;
            return updated;
          }
          return [data.rule, ...prev];
        });
        showToast('Alert rule saved.');
      }
    } catch (e: any) {
      showToast(`Rule error: ${e.message}`);
    }
  };

  // Handler: Delete Alert Rule
  const handleDeleteAlertRule = async (id: string) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/alerts/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken }
      });
      setAlertRules(prev => prev.filter(r => r.id !== id));
      showToast('Alert rule deleted.');
    } catch (e: any) {
      showToast(`Delete rule error: ${e.message}`);
    }
  };

  // Handler: Ack Alert
  const handleAckAlert = async (id: string) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/alerts/${encodeURIComponent(id)}/ack`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      setActiveAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' } : a));
      setUnreadAlertsCount(prev => Math.max(0, prev - 1));
      showToast('Alert acknowledged.');
    } catch {}
  };

  // Handler: Snooze Alert
  const handleSnoozeAlert = async (id: string, minutes: number) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/alerts/${encodeURIComponent(id)}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ minutes })
      });
      setActiveAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'snoozed' } : a));
      showToast(`Alert snoozed for ${minutes} minutes.`);
    } catch {}
  };

  // Handler: Mark all alerts as read
  const handleMarkAllAlertsRead = async () => {
    if (!adminToken) return;
    try {
      await fetch('/api/admin/alerts/read-all', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      setActiveAlerts(prev => prev.map(a => ({ ...a, status: 'acknowledged' })));
      setUnreadAlertsCount(0);
      showToast('All alerts marked as read.');
    } catch {}
  };

  // Handler: Block Target (IP, CIDR, Device, Country)
  const handleBlockTarget = async (item: { type: string; value: string; reason: string; durationHours?: number }) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/security/block-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      if (res.ok && data.blocked) {
        setBlockList(prev => [data.blocked, ...prev]);
        setAutoBlockSuggestions(prev => prev.filter(s => s.ip !== item.value));
        showToast(`Target [${item.value}] added to security block list.`);
      }
    } catch (e: any) {
      showToast(`Block error: ${e.message}`);
    }
  };

  // Handler: Unblock Target
  const handleUnblockTarget = async (id: string) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/security/block-list/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken }
      });
      setBlockList(prev => prev.filter(b => b.id !== id));
      showToast('Target unblocked.');
    } catch (e: any) {
      showToast(`Unblock error: ${e.message}`);
    }
  };

  // Handler: Dismiss Suggestion
  const handleDismissAutoBlock = async (ip: string) => {
    if (!adminToken) return;
    try {
      await fetch('/api/admin/security/suggestions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ ip })
      });
      setAutoBlockSuggestions(prev => prev.filter(s => s.ip !== ip));
    } catch {}
  };

  // Handler: Sign Out Everywhere
  const handleSignOutEverywhere = async () => {
    if (!adminToken) return;
    try {
      await fetch('/api/admin/security/sessions/sign-out-everywhere', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      handleLogout();
    } catch {}
  };

  // Handler: Send Message to Viewer Session
  const handleSendSessionMessage = async (sessionId: string, message: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        showToast('Message broadcast to viewer stream.');
      }
    } catch (e: any) {
      showToast(`Message error: ${e.message}`);
    }
  };

  // Handler: Terminate Session
  const handleTerminatePlaybackSession = async (sessionId: string, reason: string) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ reason })
      });
      setOverview(prev => {
        if (!prev) return prev;
        const updated = prev.activeUsers.filter(u => u.sessionId !== sessionId);
        return { ...prev, activeUsersCount: updated.length, activeUsers: updated };
      });
      showToast('Session terminated.');
    } catch (e: any) {
      showToast(`Termination error: ${e.message}`);
    }
  };

  // Handler: Resolve Error
  const handleResolveError = async (fingerprint: string) => {
    if (!adminToken) return;
    try {
      await fetch('/api/admin/errors/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ fingerprint })
      });
      setErrorGroups(prev => prev.map(e => e.fingerprint === fingerprint ? { ...e, status: 'resolved' } : e));
      showToast('Error fingerprint marked as resolved.');
    } catch {}
  };

  // Handler: Update Maintenance
  const handleUpdateMaintenance = async (config: any) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setMaintenanceConfig(data.config);
        showToast('Maintenance configuration updated.');
      }
    } catch (e: any) {
      showToast(`Maintenance error: ${e.message}`);
    }
  };

  // Handler: Save Announcement
  const handleSaveAnnouncement = async (ann: any) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/system/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify(ann)
      });
      const data = await res.json();
      if (res.ok && data.announcement) {
        setAnnouncements(prev => [data.announcement, ...prev.filter(a => a.id !== data.announcement.id)]);
        showToast('Announcement banner published.');
      }
    } catch (e: any) {
      showToast(`Announcement error: ${e.message}`);
    }
  };

  // Handler: Delete Announcement
  const handleDeleteAnnouncement = async (id: string) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/system/announcements/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken }
      });
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      showToast('Announcement removed.');
    } catch {}
  };

  // Handler: Update Data Retention
  const handleUpdateDataRetention = async (config: any) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/system/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setDataRetentionConfig(data.config);
        showToast('Data retention policies saved.');
      }
    } catch (e: any) {
      showToast(`Retention error: ${e.message}`);
    }
  };

  // Handler: Trigger Demo Seeding Wave
  const handleTriggerSeed = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/demo/seed?count=20', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`⚡ Dispatched wave of ${data.generatedCount} realistic live events!`);
      }
    } catch (e: any) {
      showToast(`Seed error: ${e.message}`);
    }
  };

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

  // LiveChart data feeds for the Overview Dashboard
  const liveTrafficChartData = useMemo(() => {
    if (!activeTimelineData || activeTimelineData.length === 0) {
      return [
        { label: '00:00', requests: 0, bandwidthKb: 0, thirdParty: 0 },
        { label: '06:00', requests: 0, bandwidthKb: 0, thirdParty: 0 },
        { label: '12:00', requests: 0, bandwidthKb: 0, thirdParty: 0 },
        { label: '18:00', requests: 0, bandwidthKb: 0, thirdParty: 0 },
        { label: '23:59', requests: 0, bandwidthKb: 0, thirdParty: 0 }
      ];
    }
    return activeTimelineData.map(item => ({
      label: item.label || '00:00',
      requests: item.requests || 0,
      bandwidthKb: Math.round((item.bytes || 0) / 1024),
      thirdParty: item.thirdPartyRequests || 0
    }));
  }, [activeTimelineData]);

  const trafficChartSeries = useMemo(() => [
    { key: 'requests', label: 'HTTP Transactions', colorVar: '#38bdf8', unit: 'req' },
    { key: 'bandwidthKb', label: 'Bandwidth Volume', colorVar: '#c084fc', unit: 'KB' },
    { key: 'thirdParty', label: '3rd Party API Calls', colorVar: '#ec4899', unit: 'req' }
  ], []);

  const systemHealthChartData = useMemo(() => {
    if (!trafficLogs || trafficLogs.length === 0) {
      return [
        { label: '10m ago', latency: 0, p95Latency: 0, errorRate: 0 },
        { label: '8m ago', latency: 0, p95Latency: 0, errorRate: 0 },
        { label: '6m ago', latency: 0, p95Latency: 0, errorRate: 0 },
        { label: '4m ago', latency: 0, p95Latency: 0, errorRate: 0 },
        { label: '2m ago', latency: 0, p95Latency: 0, errorRate: 0 },
        { label: 'Now', latency: 0, p95Latency: 0, errorRate: 0 }
      ];
    }
    const sliceCount = 6;
    const sliceSize = Math.max(1, Math.ceil(trafficLogs.length / sliceCount));
    const slices = [];
    for (let i = sliceCount - 1; i >= 0; i--) {
      const sliceLogs = trafficLogs.slice(i * sliceSize, (i + 1) * sliceSize);
      const lats = sliceLogs.map(l => l.latencyMs || (l as any).durationMs || 15).sort((a, b) => a - b);
      const avgLat = lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
      const p95Lat = lats.length > 0 ? lats[Math.floor(lats.length * 0.95)] || avgLat : avgLat;
      const errors = sliceLogs.filter(l => (l.statusCode || 200) >= 400).length;
      const errRate = sliceLogs.length > 0 ? Math.round((errors / sliceLogs.length) * 100) : 0;
      slices.push({
        label: i === 0 ? 'Now' : `${i * 2}m ago`,
        latency: avgLat,
        p95Latency: p95Lat,
        errorRate: errRate
      });
    }
    return slices;
  }, [trafficLogs]);

  const healthChartSeries = useMemo(() => [
    { key: 'latency', label: 'Average Latency', colorVar: '#10b981', unit: 'ms' },
    { key: 'p95Latency', label: 'P95 Latency', colorVar: '#f59e0b', unit: 'ms' },
    { key: 'errorRate', label: 'Error Rate', colorVar: '#ef4444', unit: '%' }
  ], []);

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
  const toggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'soft-paper' : 'midnight-slate');
  };

  const navTabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3, group: 'CORE MONITORING' },
    { id: 'traffic', label: 'Traffic Feed', icon: Radio, group: 'CORE MONITORING', badge: isStreamPaused ? 'Paused' : '● Live' },
    { id: 'devices', label: 'Visitors & Devices', icon: Laptop, group: 'CORE MONITORING', badge: totalDevicesCount || devicesList.length ? `${totalDevicesCount || devicesList.length}` : undefined },
    { id: 'sessions', label: 'Open Sessions', icon: Users, group: 'CORE MONITORING', badge: overview?.activeUsersCount ? `${overview.activeUsersCount} live` : undefined },
    
    { id: 'alerts', label: 'Alert Rules & Center', icon: AlertTriangle, group: 'PLATFORM OPERATIONS', badge: unreadAlertsCount ? `${unreadAlertsCount} new` : undefined, badgeColor: 'var(--danger, #EC8F95)' },
    { id: 'security', label: 'Security & Access Control', icon: Lock, group: 'PLATFORM OPERATIONS', badge: blockList.length ? `${blockList.length} blk` : undefined },
    { id: 'playback', label: 'Playback Quality', icon: Film, group: 'PLATFORM OPERATIONS' },
    { id: 'content', label: 'Content Insights', icon: TrendingUp, group: 'PLATFORM OPERATIONS' },
    { id: 'geo', label: 'Geography & Traffic', icon: Globe, group: 'PLATFORM OPERATIONS' },
    { id: 'errors', label: 'Error Tracking', icon: AlertCircle, group: 'PLATFORM OPERATIONS', badge: errorGroups.filter(e => e.status === 'active').length ? `${errorGroups.filter(e => e.status === 'active').length}` : undefined },
    { id: 'infra', label: 'Infrastructure Health', icon: Server, group: 'PLATFORM OPERATIONS' },

    { id: 'thirdparty', label: '3rd Party APIs', icon: Zap, group: 'SYSTEM & INTEGRATIONS' },
    { id: 'embeds', label: 'Online Streams & Embeds', icon: Film, group: 'SYSTEM & INTEGRATIONS' },
    { id: 'webhooks', label: 'Webhooks & Outbound', icon: Send, group: 'SYSTEM & INTEGRATIONS' },
    { id: 'users', label: 'Registered Accounts', icon: Database, group: 'SYSTEM & INTEGRATIONS' },
    { id: 'audit', label: 'Audit Log Trail', icon: Shield, group: 'SYSTEM & INTEGRATIONS' },
    { id: 'system', label: 'Maintenance & Policy', icon: SlidersHorizontal, group: 'SYSTEM & INTEGRATIONS' }
  ];

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg, #0F1217)',
      color: 'var(--text-1, #E4E8EE)',
      fontFamily: 'var(--font-ui, Inter, sans-serif)'
    }}>
      {/* Toast Notification Container */}
      <EventToastContainer
        toasts={toasts}
        onDismiss={id => setToasts(t => t.filter(x => x.id !== id))}
        onAcknowledge={handleAckAlert}
      />

      {/* Command Palette Modal (Ctrl+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigateTab={t => setActiveTab(t as any)}
        devices={devicesList}
        sessions={overview?.activeUsers || []}
        onSignOutEverywhere={handleSignOutEverywhere}
      />

      {/* Inbound Webhook Info Modal */}
      <InboundWebhookModal
        isOpen={inboundModalOpen}
        onClose={() => setInboundModalOpen(false)}
      />

      {/* Left Sidebar Navigation */}
      <aside style={{
        width: '260px',
        background: 'var(--surface-1, #151A21)',
        borderRight: '1px solid var(--border, #262D39)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        zIndex: 100,
        flexShrink: 0
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--border, #262D39)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--accent, #8CA9EE)',
            color: 'var(--on-accent, #0C1424)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.1rem'
          }}>
            V
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display, Outfit)', color: 'var(--text-1, #E4E8EE)' }}>
              Valor Portal
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600, letterSpacing: '0.04em' }}>
              REAL-TIME ADMIN CONSOLE
            </span>
          </div>
        </div>

        {/* Navigation Items Grouped */}
        <div style={{ padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
          {['CORE MONITORING', 'PLATFORM OPERATIONS', 'SYSTEM & INTEGRATIONS'].map(groupName => {
            const groupTabs = navTabs.filter(t => t.group === groupName);
            return (
              <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{
                  padding: '4px 10px',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  color: 'var(--text-3, #8F99AA)',
                  letterSpacing: '0.06em'
                }}>
                  {groupName}
                </span>

                {groupTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: 'none',
                        background: isActive ? 'var(--accent-soft, rgba(140, 169, 238, 0.14))' : 'transparent',
                        color: isActive ? 'var(--accent, #8CA9EE)' : 'var(--text-2, #A9B2C0)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.82rem',
                        fontWeight: isActive ? 700 : 500,
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <Icon size={16} />
                        <span>{tab.label}</span>
                      </div>

                      {tab.badge && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '999px',
                          background: tab.badgeColor || (isActive ? 'var(--accent, #8CA9EE)' : 'var(--surface-3, #232B36)'),
                          color: isActive ? 'var(--on-accent, #0C1424)' : 'var(--text-1, #E4E8EE)'
                        }}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: '14px',
          borderTop: '1px solid var(--border, #262D39)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} color="var(--accent, #8CA9EE)" />
            <span style={{ fontSize: '0.76rem', color: 'var(--text-2, #A9B2C0)' }}>Admin: <strong>{adminCallerIp || 'Local'}</strong></span>
          </div>
          <a
            href="/"
            title="Return to Player"
            style={{ color: 'var(--text-3, #8F99AA)', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={15} />
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Bar */}
        <header style={{
          height: '60px',
          background: 'var(--surface-1, #151A21)',
          borderBottom: '1px solid var(--border, #262D39)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 90
        }}>
          {/* Active Tab Heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 700,
              fontFamily: 'var(--font-display, Outfit)',
              color: 'var(--text-1, #E4E8EE)',
              textTransform: 'capitalize'
            }}>
              {navTabs.find(t => t.id === activeTab)?.label || activeTab}
            </h1>
          </div>

          {/* Right Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Real-Time Connection Indicator */}
            <ConnectionStatus
              status={connectionState}
              reconnectAttempt={reconnectAttempt}
              nextRetrySeconds={nextRetrySeconds}
              missedEventsApplied={missedEventsApplied}
              isCatchingUp={isCatchingUp}
              onManualReconnect={manualReconnect}
            />

            {/* Command Palette Trigger (Ctrl+K) */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              title="Open Command Palette (Ctrl+K / Cmd+K)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-2, #A9B2C0)',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              <Search size={13} />
              <span>Search…</span>
              <kbd style={{
                background: 'var(--surface-3, #232B36)',
                padding: '1px 4px',
                borderRadius: '3px',
                fontSize: '0.68rem',
                color: 'var(--text-3, #8F99AA)'
              }}>
                Ctrl+K
              </kbd>
            </button>

            {/* Inbound Webhooks API Modal Trigger */}
            <button
              onClick={() => setInboundModalOpen(true)}
              title="View Inbound Webhooks HMAC-SHA256 documentation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-2, #A9B2C0)',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              <Radio size={13} />
              <span>Inbound API</span>
            </button>

            {/* Notification Center */}
            <NotificationCenter
              alerts={activeAlerts}
              unreadCount={unreadAlertsCount}
              isOpen={notificationsOpen}
              onToggle={() => setNotificationsOpen(prev => !prev)}
              onAcknowledge={handleAckAlert}
              onSnooze={handleSnoozeAlert}
              onMarkAllAsRead={handleMarkAllAlertsRead}
            />

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Theme`}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-2, #A9B2C0)',
                padding: '6px 9px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Admin Logout */}
            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{
                background: 'rgba(236, 143, 149, 0.12)',
                border: '1px solid var(--danger, #EC8F95)',
                color: 'var(--danger, #EC8F95)',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <LogOut size={13} />
              <span>Exit</span>
            </button>
          </div>
        </header>

        {/* Dashboard Main View Container */}
        <main style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <AdminDashboardSkeleton />
          ) : (
            <>

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

          {/* Live Telemetry & System Health Performance Graphs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '1.25rem'
          }}>
            <LiveChart
              title="Real-Time Traffic & Bandwidth Velocity Stream"
              series={trafficChartSeries}
              data={liveTrafficChartData}
              height={220}
              selectedRange={activityTimeframe === 'day' ? '24h' : activityTimeframe === 'week' ? '7d' : activityTimeframe === 'month' ? '30d' : 'Live'}
              rangeOptions={['Live', '24h', '7d', '30d']}
              onRangeChange={(r) => {
                if (r === 'Live' || r === '24h') handleTimeframeChange('day');
                else if (r === '7d') handleTimeframeChange('week');
                else if (r === '30d') handleTimeframeChange('month');
              }}
            />

            <LiveChart
              title="Upstream Latency & Error Rate Performance"
              series={healthChartSeries}
              data={systemHealthChartData}
              height={220}
              showNowMarker={true}
            />
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
          <ThirdPartyMonitor />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <SessionList
            sessions={(overview?.activeUsers as any) || []}
            onSendMessage={handleSendSessionMessage}
            onTerminateSession={handleTerminatePlaybackSession}
          />
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: LIVE TRAFFIC FEED & REAL-TIME INSPECTOR */}
      {/* ========================================================================= */}
      {activeTab === 'traffic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <TrafficTools
            logs={normalizedTrafficRows}
            isPaused={isStreamPaused}
            bufferedCount={bufferedTraffic.length}
            onTogglePause={() => setIsStreamPaused(p => !p)}
            onApplyBuffer={flushBufferedEvents}
            onCopy={handleCopy}
          />
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
      {/* TAB: ALERT RULES & NOTIFICATION CENTER */}
      {/* ========================================================================= */}
      {activeTab === 'alerts' && (
        <AlertRuleEditor
          rules={alertRules}
          onSaveRule={handleSaveAlertRule}
          onDeleteRule={handleDeleteAlertRule}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: SECURITY & ACCESS CONTROL */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <BlockListManager
          blockList={blockList}
          suggestions={autoBlockSuggestions}
          adminSessions={adminSessions}
          onBlock={handleBlockTarget}
          onUnblock={handleUnblockTarget}
          onDismissSuggestion={handleDismissAutoBlock}
          onSignOutEverywhere={handleSignOutEverywhere}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: PLAYBACK QUALITY & STREAMING METRICS */}
      {/* ========================================================================= */}
      {activeTab === 'playback' && (
        <PlaybackQuality
          metrics={playbackQualityMetrics}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: CONTENT INSIGHTS & RETENTION COHORTS */}
      {/* ========================================================================= */}
      {activeTab === 'content' && (
        <ContentInsights
          insights={contentInsights}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: GEOGRAPHY & TRAFFIC MAP */}
      {/* ========================================================================= */}
      {activeTab === 'geo' && (
        <GeoAnalytics
          geoStats={geoStats}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: ERROR TRACKING & FINGERPRINTS */}
      {/* ========================================================================= */}
      {activeTab === 'errors' && (
        <ErrorGroups
          errorGroups={errorGroups}
          onResolveError={handleResolveError}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: INFRASTRUCTURE HEALTH & INCIDENTS */}
      {/* ========================================================================= */}
      {activeTab === 'infra' && (
        <InfraHealth
          infra={infraStatus}
          incidentTimeline={incidentTimeline}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: AUDIT LOG TRAIL */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <AuditLogViewer
          logs={auditLogs}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: MAINTENANCE & POLICY */}
      {/* ========================================================================= */}
            {/* TAB: ONLINE STREAMS & EMBEDS */}
      {activeTab === 'embeds' && (
        <EmbedProvidersTab
          onNotify={(msg) => showToast(msg)}
          token={adminToken || undefined}
        />
      )}

      {activeTab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <MaintenanceBroadcast
            maintenance={maintenanceConfig}
            announcements={announcements}
            onUpdateMaintenance={handleUpdateMaintenance}
            onSaveAnnouncement={handleSaveAnnouncement}
            onDeleteAnnouncement={handleDeleteAnnouncement}
          />
          <DataRetention
            config={dataRetentionConfig}
            onUpdateConfig={handleUpdateDataRetention}
          />
        </div>
      )}

            </>
          )}
        </main>
      </div>

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
