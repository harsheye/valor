import {
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleDashed,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent } from './ui/collapsible';
import { cn } from '../lib/utils';
import { CustomSelect } from './CustomSelect';
import { BACKEND_ORIGIN } from '../App';
import {
  Server,
  HardDrive,
  Globe,
  Sparkles,
  Check,
  CheckCircle2,
  Shield,
  Zap,
  Lock,
  ArrowRight,
  Database,
  Radio,
  Sliders,
  Play
} from 'lucide-react';

const initialSteps = [
  {
    id: 'profile',
    title: 'Select User Profile',
    description: 'Select an existing profile, create a server profile, or start with a private local profile.',
    completed: false,
    actionLabel: 'Confirm Profile Selection',
    actionHref: '#'
  },
  {
    id: 'storage',
    title: 'Choose Storage Location',
    description: 'Select how Valor should save your settings, ratings, and playback history.',
    completed: false,
    actionLabel: 'Confirm Storage Location',
    actionHref: '#'
  },
  {
    id: 'languages',
    title: 'Preferred Languages',
    description: 'Default audio and subtitle tracks are ready. English is selected by default.',
    completed: false,
    actionLabel: 'Save Preferences',
    actionHref: '#'
  },
  {
    id: 'ready',
    title: 'Ready to stream!',
    description: 'All engines are primed. You are ready to experience high-definition media playback.',
    completed: false,
    actionLabel: 'Get Started with Valor',
    actionHref: '#'
  }
];

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  actionHref: string;
}

interface Onboarding01Props {
  settings: any;
  handleDefaultLangChange: (key: string, val: any) => void;
  audioOptions: any[];
  subOptions: any[];
  onComplete: () => void;
  onSelectProfile: (userId: string, storageMode: 'localstorage' | 'file') => void;
  videos: any[];
  openAuthModal: (tab: 'login' | 'signup', targetProfile?: any, onSuccess?: (userId: string) => void) => void;
  availableProfiles?: any[];
}

function CircularProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const progress = total > 0 ? ((total - completed) / total) * 100 : 0;
  const strokeDashoffset = 100 - progress;

  return (
    <div style={{ position: 'relative', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        height="22"
        viewBox="0 0 24 24"
        width="22"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx="12"
          cy="12"
          fill="none"
          r="9"
          strokeWidth="2.5"
          stroke="rgba(255,255,255,0.1)"
        />
        <circle
          cx="12"
          cy="12"
          fill="none"
          r="9"
          strokeDasharray="56.54"
          strokeLinecap="round"
          strokeWidth="2.5"
          stroke="url(#progressGradient)"
          style={{
            strokeDashoffset: (56.54 * (100 - ((total - completed) / total) * 100)) / 100,
            transition: 'stroke-dashoffset 0.4s ease'
          }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function StepIndicator({ completed, isActive }: { completed: boolean; isActive: boolean }) {
  if (completed) {
    return (
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.35))',
        border: '1.5px solid #10b981',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
      }}>
        <Check style={{ width: '13px', height: '13px', color: '#10b981', strokeWidth: 3 }} />
      </div>
    );
  }
  if (isActive) {
    return (
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
        border: '1.5px solid #818cf8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 14px rgba(99, 102, 241, 0.5)'
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1.5px dashed rgba(255, 255, 255, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)' }} />
    </div>
  );
}

export function Onboarding01({
  settings,
  handleDefaultLangChange,
  audioOptions,
  subOptions,
  onComplete,
  onSelectProfile,
  videos,
  openAuthModal,
  availableProfiles = []
}: Onboarding01Props) {
  const [currentSteps, setCurrentSteps] = useState<OnboardingStep[]>(initialSteps);
  const [openStepId, setOpenStepId] = useState<string | null>(() => {
    const firstIncomplete = initialSteps.find((s) => !s.completed);
    return firstIncomplete?.id ?? initialSteps[0]?.id ?? null;
  });
  const [dismissed, setDismissed] = useState(false);

  // Profile-related states
  const [profiles, setProfiles] = useState<any[]>([]);
  const [onboardingError, setOnboardingError] = useState('');
  const [hasConfiguredProfile, setHasConfiguredProfile] = useState(() => {
    return !!settings.userId && settings.userId !== '';
  });
  const [isMigrating, setIsMigrating] = useState(false);
  const [chosenMode, setChosenMode] = useState<'server' | 'local' | null>(null);
  const [localProfileName, setLocalProfileName] = useState('');
  const [serverProfileName, setServerProfileName] = useState('');
  const [serverUsername, setServerUsername] = useState('');
  const [serverPassword, setServerPassword] = useState('');

  // Storage and Language states: Both are initialized to TRUE so users are NEVER locked
  // out when default English or default storage is active!
  const [hasConfiguredStorage, setHasConfiguredStorage] = useState(true);
  const [hasConfiguredLanguages, setHasConfiguredLanguages] = useState(true);

  const secureFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const ipBlockedUntil = localStorage.getItem('valor_ip_blocked_until');
    const accountLockedUntil = localStorage.getItem('valor_account_locked_until');
    const now = Date.now();
    
    if (ipBlockedUntil && new Date(ipBlockedUntil).getTime() > now) {
      const msg = `IP blocked until ${new Date(ipBlockedUntil).toLocaleString()}`;
      setOnboardingError(msg);
      throw new Error(msg);
    }
    
    if (accountLockedUntil && new Date(accountLockedUntil).getTime() > now) {
      const msg = `Account locked until ${new Date(accountLockedUntil).toLocaleString()}`;
      setOnboardingError(msg);
      throw new Error(msg);
    }
    
    const response = await fetch(input, init);
    
    if (response.status === 403) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data.blockedUntil) {
          localStorage.setItem('valor_ip_blocked_until', data.blockedUntil);
          setOnboardingError(`IP blocked until ${new Date(data.blockedUntil).toLocaleString()}`);
        }
        if (data.lockedUntil) {
          localStorage.setItem('valor_account_locked_until', data.lockedUntil);
          setOnboardingError(`Account locked until ${new Date(data.lockedUntil).toLocaleString()}`);
        }
      } catch (e) {}
    }
    
    return response;
  };

  // Fetch server profiles on mount
  React.useEffect(() => {
    secureFetch(`${BACKEND_ORIGIN}/api/profiles`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProfiles(data);
      })
      .catch(err => console.error('Failed to fetch server profiles:', err));
  }, []);

  const completedCount = currentSteps.filter((s) => s.completed).length;
  const remainingCount = currentSteps.length - completedCount;

  const handleStepClick = (stepId: string) => {
    setOpenStepId(openStepId === stepId ? null : stepId);
  };

  const handleStepAction = (step: OnboardingStep) => {
    const updated = currentSteps.map((s) =>
      s.id === step.id ? { ...s, completed: true } : s
    );
    setCurrentSteps(updated);
    const nextIncomplete = updated.find((s) => !s.completed);
    setOpenStepId(nextIncomplete?.id ?? null);
    
    if (updated.every(s => s.completed) || step.id === 'ready') {
      onComplete();
    }
  };

  // Step configuration check: storage and languages are ALWAYS valid out-of-the-box!
  const isStepConfigured = (stepId: string) => {
    if (stepId === 'profile') return hasConfiguredProfile || (!!settings.userId && settings.userId !== '');
    if (stepId === 'storage') return true;
    if (stepId === 'languages') return true;
    return true;
  };

  const currentStorageMode = settings.storageMode || (settings.userId?.startsWith('local') ? 'localstorage' : 'file');

  const renderValorControls = (stepId: string) => {
    if (stepId === 'profile') {
      const activeUserId = settings.userId;

      const autoAdvance = () => {
        const step = currentSteps.find(s => s.id === 'profile');
        if (step) {
          handleStepAction(step);
        }
      };

      if (chosenMode === null) {
        return (
          <div style={{ marginTop: '0.9rem', marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <span style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
              Choose how you want to manage your user data. Cloud storage syncs across your devices via Docker, while Local storage remains 100% offline in this browser.
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setChosenMode('server'); setOnboardingError(''); }}
                style={{
                  padding: '18px 14px',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.08))',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 20px -5px rgba(99, 102, 241, 0.25)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#818cf8';
                  e.currentTarget.style.boxShadow = '0 8px 25px -4px rgba(99, 102, 241, 0.45)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)';
                  e.currentTarget.style.boxShadow = '0 4px 20px -5px rgba(99, 102, 241, 0.25)';
                }}
              >
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
                }}>
                  <Server style={{ width: '22px', height: '22px', color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>Server Cloud</span>
                  <span style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: 500 }}>PostgreSQL + Redis Cache</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setChosenMode('local'); setOnboardingError(''); }}
                style={{
                  padding: '18px 14px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.05))',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 20px -5px rgba(16, 185, 129, 0.15)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#34d399';
                  e.currentTarget.style.boxShadow = '0 8px 25px -4px rgba(16, 185, 129, 0.35)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                  e.currentTarget.style.boxShadow = '0 4px 20px -5px rgba(16, 185, 129, 0.15)';
                }}
              >
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #059669, #0891b2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                }}>
                  <HardDrive style={{ width: '22px', height: '22px', color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>Local Offline</span>
                  <span style={{ fontSize: '0.7rem', color: '#6ee7b7', fontWeight: 500 }}>In-Browser IndexedDB</span>
                </div>
              </button>
            </div>
          </div>
        );
      }

      if (chosenMode === 'local') {
        return (
          <div style={{ marginTop: '0.9rem', marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Create Your Local Profile:</span>
            <input
              type="text"
              placeholder="e.g. Cinema Enthusiast"
              value={localProfileName}
              onChange={e => setLocalProfileName(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '0.85rem',
                color: '#fff',
                outline: 'none',
                fontFamily: 'Outfit, sans-serif',
                transition: 'border-color 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#10b981'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                disabled={!localProfileName.trim()}
                onClick={() => {
                  const newUserId = 'local_' + Math.random().toString(36).substring(2, 11);
                  localStorage.setItem('valor_active_user_id', newUserId);
                  
                  let localProfiles = [];
                  try {
                    const localSaved = localStorage.getItem('valor_local_profiles');
                    if (localSaved) {
                      localProfiles = JSON.parse(localSaved);
                    }
                  } catch {}
                  
                  const newProfile = {
                    userId: newUserId,
                    name: localProfileName.trim(),
                    storageMode: 'localstorage',
                    hasPassword: false
                  };
                  localProfiles.push(newProfile);
                  localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                  try {
                    const settingsKey = `valor_settings_${newUserId}`;
                    const saved = localStorage.getItem(settingsKey) || '{}';
                    const parsed = JSON.parse(saved);
                    parsed.profileName = localProfileName.trim();
                    parsed.userId = newUserId;
                    parsed.storageMode = 'localstorage';
                    localStorage.setItem(settingsKey, JSON.stringify(parsed));
                  } catch {}
                  
                  handleDefaultLangChange('storageMode', 'localstorage');
                  onSelectProfile(newUserId, 'localstorage');
                  
                  setHasConfiguredProfile(true);
                  autoAdvance();
                }}
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: localProfileName.trim() ? 'pointer' : 'not-allowed',
                  opacity: localProfileName.trim() ? 1 : 0.6,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.2s ease'
                }}
              >
                Save & Continue
              </button>
              <button
                type="button"
                onClick={() => { setChosenMode(null); setLocalProfileName(''); }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                Back
              </button>
            </div>
          </div>
        );
      }

      const isAlreadyLoggedIn = activeUserId !== 'local' && !activeUserId?.startsWith('local_');
      const activeServerProfile = (availableProfiles || []).find(p => p.userId === activeUserId);
      const loggedInUsername = activeServerProfile?.username || localStorage.getItem('valor_logged_in_username') || '';

      return (
        <div style={{ marginTop: '0.9rem', marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {onboardingError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
              fontSize: '0.78rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⚠️</span>
              <span>{onboardingError}</span>
            </div>
          )}

          {/* Profile Name Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>Profile Name</label>
            <input
              type="text"
              placeholder="e.g. Master Bedroom Cinema"
              value={serverProfileName}
              onChange={e => setServerProfileName(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '0.85rem',
                color: '#fff',
                outline: 'none',
                fontFamily: 'Outfit, sans-serif',
                transition: 'border-color 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#818cf8'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>Username</label>
            <input
              type="text"
              placeholder="Enter username..."
              disabled={isAlreadyLoggedIn}
              value={isAlreadyLoggedIn ? loggedInUsername : serverUsername}
              onChange={e => setServerUsername(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '0.85rem',
                color: isAlreadyLoggedIn ? 'rgba(255,255,255,0.4)' : '#fff',
                outline: 'none',
                fontFamily: 'Outfit, sans-serif',
                transition: 'border-color 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#818cf8'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
              {isAlreadyLoggedIn ? 'Account Password' : 'Password'}
            </label>
            <input
              type="password"
              placeholder="Enter password..."
              value={serverPassword}
              onChange={e => setServerPassword(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '0.85rem',
                color: '#fff',
                outline: 'none',
                fontFamily: 'Outfit, sans-serif',
                transition: 'border-color 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#818cf8'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              disabled={!serverProfileName.trim() || (!isAlreadyLoggedIn && !serverUsername.trim()) || !serverPassword}
              onClick={async () => {
                setOnboardingError('');
                const name = serverProfileName.trim();
                const uName = isAlreadyLoggedIn ? loggedInUsername : serverUsername.trim();
                try {
                  const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/migrate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      name, 
                      username: uName,
                      password: serverPassword,
                      settings: { ...settings, isOnboarded: false },
                      history: videos 
                    })
                  });
                  const resData = await res.json();
                  if (resData.success) {
                    localStorage.setItem('valor_logged_in_username', uName);
                    handleDefaultLangChange('storageMode', 'file');
                    onSelectProfile(resData.userId, 'file');
                    setHasConfiguredProfile(true);
                    setServerProfileName('');
                    setServerUsername('');
                    setServerPassword('');
                    autoAdvance();
                  } else {
                    setOnboardingError(resData.error || 'Failed to create profile');
                  }
                } catch (err: any) {
                  setOnboardingError(err.message || 'Creation failed.');
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: (serverProfileName.trim() && (isAlreadyLoggedIn || serverUsername.trim()) && serverPassword) ? 'pointer' : 'not-allowed',
                opacity: (serverProfileName.trim() && (isAlreadyLoggedIn || serverUsername.trim()) && serverPassword) ? 1 : 0.6,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                transition: 'all 0.2s'
              }}
            >
              {isAlreadyLoggedIn ? 'Create Profile & Sync' : 'Create & Sync'}
            </button>

            {!isAlreadyLoggedIn && (
              <button
                type="button"
                disabled={!serverUsername.trim() || !serverPassword}
                onClick={async () => {
                  setOnboardingError('');
                  const uName = serverUsername.trim();
                  try {
                    const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/login`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username: uName, password: serverPassword })
                    });
                    const resData = await res.json();
                    if (resData.success) {
                      localStorage.setItem('valor_logged_in_username', uName);
                      handleDefaultLangChange('storageMode', 'file');
                      onSelectProfile(resData.userId, 'file');
                      setHasConfiguredProfile(true);
                      setServerProfileName('');
                      setServerUsername('');
                      setServerPassword('');
                      autoAdvance();
                    } else {
                      setOnboardingError(resData.error || 'Incorrect username or password');
                    }
                  } catch (err: any) {
                    setOnboardingError(err.message || 'Login failed.');
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: (serverUsername.trim() && serverPassword) ? 'pointer' : 'not-allowed',
                  opacity: (serverUsername.trim() && serverPassword) ? 1 : 0.6,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.2s'
                }}
              >
                Login & Sync
              </button>
            )}

            <button
              type="button"
              onClick={() => { setChosenMode(null); setServerProfileName(''); setServerUsername(''); setServerPassword(''); }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Back
            </button>
          </div>

          {profiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>Or Select Existing Profile:</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                {profiles.map(p => {
                  const isSelected = activeUserId === p.userId;
                  return (
                    <div
                      key={p.userId}
                      onClick={() => {
                        setOnboardingError('');
                        if (p.hasPassword) {
                          openAuthModal('login', p, (userId) => {
                            handleDefaultLangChange('storageMode', 'file');
                            onSelectProfile(userId, 'file');
                            setHasConfiguredProfile(true);
                            autoAdvance();
                          });
                        } else {
                          handleDefaultLangChange('storageMode', 'file');
                          onSelectProfile(p.userId, 'file');
                          setHasConfiguredProfile(true);
                          autoAdvance();
                        }
                      }}
                      style={{
                        background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: isSelected ? '1.5px solid #818cf8' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        padding: '14px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        boxShadow: isSelected ? '0 0 16px rgba(99, 102, 241, 0.3)' : 'none'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }
                      }}
                    >
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: isSelected ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        color: '#fff',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                        position: 'relative'
                      }}>
                        {(p.name?.[0] || 'U').toUpperCase()}
                        {p.hasPassword && (
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            background: '#0f172a',
                            borderRadius: '50%',
                            width: '15px',
                            height: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            border: '1px solid rgba(255,255,255,0.2)'
                          }}>
                            🔒
                          </div>
                        )}
                      </div>

                      <span style={{ 
                        fontSize: '0.74rem', 
                        fontWeight: isSelected ? 700 : 500, 
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.85)', 
                        textAlign: 'center', 
                        maxWidth: '100%', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        fontFamily: 'Outfit, sans-serif'
                      }}>
                        {p.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (stepId === 'storage') {
      const isServerActive = currentStorageMode === 'file' || currentStorageMode === 'server';
      const isLocalActive = currentStorageMode === 'localstorage';

      return (
        <div style={{ marginTop: '0.9rem', marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
            Valor supports seamless dual-tier storage. Your preference is pre-selected and ready to confirm immediately.
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Server Storage Card */}
            <div
              onClick={() => {
                handleDefaultLangChange('storageMode', 'file');
                setHasConfiguredStorage(true);
              }}
              style={{
                padding: '16px 14px',
                background: isServerActive 
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.12))' 
                  : 'rgba(255, 255, 255, 0.03)',
                border: isServerActive 
                  ? '1.5px solid #818cf8' 
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                position: 'relative',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isServerActive ? '0 0 24px -4px rgba(99, 102, 241, 0.4)' : 'none'
              }}
              onMouseEnter={e => {
                if (!isServerActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }
              }}
              onMouseLeave={e => {
                if (!isServerActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: isServerActive ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Server style={{ width: '18px', height: '18px', color: '#fff' }} />
                </div>
                {isServerActive && (
                  <span style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'rgba(99, 102, 241, 0.3)',
                    color: '#c7d2fe',
                    border: '1px solid rgba(99, 102, 241, 0.5)'
                  }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <div>
                <h5 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>Server Cloud</h5>
                <p style={{ margin: 0, marginTop: '4px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                  PostgreSQL 16 + Redis Cache. Telemetry & multi-device sync.
                </p>
              </div>
            </div>

            {/* Local Storage Card */}
            <div
              onClick={() => {
                handleDefaultLangChange('storageMode', 'localstorage');
                setHasConfiguredStorage(true);
              }}
              style={{
                padding: '16px 14px',
                background: isLocalActive 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(6, 182, 212, 0.1))' 
                  : 'rgba(255, 255, 255, 0.03)',
                border: isLocalActive 
                  ? '1.5px solid #34d399' 
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                position: 'relative',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isLocalActive ? '0 0 24px -4px rgba(16, 185, 129, 0.4)' : 'none'
              }}
              onMouseEnter={e => {
                if (!isLocalActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }
              }}
              onMouseLeave={e => {
                if (!isLocalActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: isLocalActive ? 'linear-gradient(135deg, #059669, #0891b2)' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <HardDrive style={{ width: '18px', height: '18px', color: '#fff' }} />
                </div>
                {isLocalActive && (
                  <span style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(16, 185, 129, 0.5)'
                  }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <div>
                <h5 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>Local Offline</h5>
                <p style={{ margin: 0, marginTop: '4px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                  In-browser IndexedDB. 100% private, zero network footprint.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (stepId === 'languages') {
      const isEnglishDefault = (settings.defaultAudio === 'ENG' || !settings.defaultAudio) && (settings.defaultSub === 'ENG' || !settings.defaultSub);

      const presets = [
        { label: '🇬🇧 English (Default)', audio: 'ENG', sub: 'ENG' },
        { label: '🎌 Anime (JP + EN Subs)', audio: 'JAP', sub: 'ENG' },
        { label: '🔇 Original Audio (No Subs)', audio: 'Original', sub: 'Off' },
        { label: '🇨🇳 Chinese (ZH + EN Subs)', audio: 'CHN', sub: 'ENG' }
      ];

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '0.9rem', marginBottom: '0.9rem' }}>
          {/* Quick presets pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Quick Presets
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {presets.map(preset => {
                const isSelected = settings.defaultAudio === preset.audio && settings.defaultSub === preset.sub;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      handleDefaultLangChange('defaultAudio', preset.audio);
                      handleDefaultLangChange('defaultSub', preset.sub);
                      setHasConfiguredLanguages(true);
                    }}
                    style={{
                      background: isSelected 
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))' 
                        : 'rgba(255,255,255,0.04)',
                      border: isSelected ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '20px',
                      padding: '5px 12px',
                      fontSize: '0.74rem',
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 0 12px rgba(99, 102, 241, 0.3)' : 'none'
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selectors grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Audio Track</span>
              <CustomSelect
                value={settings.defaultAudio || 'ENG'}
                onChange={(val) => {
                  handleDefaultLangChange('defaultAudio', val);
                  setHasConfiguredLanguages(true);
                }}
                options={audioOptions}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Subtitle Track</span>
              <CustomSelect
                value={settings.defaultSub || 'ENG'}
                onChange={(val) => {
                  handleDefaultLangChange('defaultSub', val);
                  setHasConfiguredLanguages(true);
                }}
                options={subOptions}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#10b981' }}>
            <CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} />
            <span>English preferences are active by default. Click Save Preferences to confirm.</span>
          </div>
        </div>
      );
    }

    if (stepId === 'ready') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '0.9rem', marginBottom: '0.9rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#fff' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span>Storage: <b>{currentStorageMode === 'localstorage' ? 'Local IndexedDB' : 'Server Docker'}</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#fff' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span>Audio: <b>{settings.defaultAudio || 'ENG'}</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#fff' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span>Subtitles: <b>{settings.defaultSub || 'ENG'}</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#fff' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span>FFmpeg Core: <b>Ready</b></span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (dismissed) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'rgba(8, 10, 16, 0.95)', padding: '1rem', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
            Checklist dismissed
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
              onClick={() => setDismissed(false)}
            >
              Show again
            </button>
            <button
              style={{ color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
              onClick={onComplete}
            >
              Finish Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 15%, rgba(99, 102, 241, 0.22), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(236, 72, 153, 0.15), transparent 50%), rgba(8, 10, 18, 0.94)',
      padding: '1.25rem',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      backdropFilter: 'blur(32px)',
      WebkitBackdropFilter: 'blur(32px)',
      overflowY: 'auto'
    }}>
      <style>{`
        .onboarding-card {
          position: relative;
          width: 100%;
          max-width: 520px;
          background: rgba(18, 22, 34, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 1.5rem;
          color: #fff;
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.95), 0 0 50px -10px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }
        .onboarding-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 10%;
          right: 10%;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, #6366f1, #ec4899, transparent);
        }
        .onboarding-glow-btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 9px 20px;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 18px rgba(99, 102, 241, 0.4);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .onboarding-glow-btn:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 8px 25px rgba(99, 102, 241, 0.6);
        }
        .onboarding-glow-btn:active {
          transform: translateY(0);
        }
        .step-row-container {
          cursor: pointer;
          transition: all 0.2s ease;
        }
      `}</style>
      
      <div className="onboarding-card">
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '12px' }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 9px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              marginBottom: '8px'
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 6px #818cf8' }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#c7d2fe', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Valor Cinema Studio
              </span>
            </div>
            <h3 style={{
              margin: 0,
              fontSize: '1.28rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #ffffff 40%, #cbd5e1 75%, #a5b4fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.3px'
            }}>
              Setup Preferences
            </h3>
            <p style={{ margin: 0, marginTop: '3px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)' }}>
              Tailor your player environment in seconds.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '5px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <CircularProgress
                completed={remainingCount}
                total={currentSteps.length}
              />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>
                {completedCount}/{currentSteps.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onComplete}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)',
                padding: '5px 12px',
                fontSize: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
              }}
              title="Skip onboarding"
            >
              Skip
            </button>
          </div>
        </div>

        {/* Steps Accordion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {currentSteps.map((step, index) => {
            const isOpen = openStepId === step.id;
            const isConfigured = isStepConfigured(step.id);

            return (
              <div
                key={step.id}
                style={{
                  borderRadius: '14px',
                  background: isOpen ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                  border: isOpen ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                  boxShadow: isOpen ? '0 8px 30px -10px rgba(99, 102, 241, 0.2)' : 'none',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  overflow: 'hidden'
                }}
              >
                <div
                  className="step-row-container"
                  onClick={() => handleStepClick(step.id)}
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <StepIndicator completed={step.completed} isActive={isOpen} />
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{
                        margin: 0,
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        color: step.completed ? '#10b981' : isOpen ? '#fff' : 'rgba(255,255,255,0.85)',
                        transition: 'color 0.2s'
                      }}>
                        {step.title}
                      </h4>
                      {!isOpen && (
                        <p style={{
                          margin: 0,
                          marginTop: '2px',
                          fontSize: '0.74rem',
                          color: 'rgba(255,255,255,0.45)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <IconChevronRight
                    style={{
                      width: '18px',
                      height: '18px',
                      color: isOpen ? '#818cf8' : 'rgba(255,255,255,0.3)',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      flexShrink: 0
                    }}
                  />
                </div>

                <Collapsible open={isOpen}>
                  <CollapsibleContent>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '0 16px 16px 16px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        paddingTop: '10px'
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }}>
                        {step.description}
                      </p>

                      {renderValorControls(step.id)}

                      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="onboarding-glow-btn"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (!isConfigured) return;
                            handleStepAction(step);
                          }}
                          style={{
                            opacity: isConfigured ? 1 : 0.5,
                            cursor: isConfigured ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <span>{step.actionLabel}</span>
                          <ArrowRight style={{ width: '15px', height: '15px' }} />
                        </button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
