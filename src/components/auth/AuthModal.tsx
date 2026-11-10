import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Loader2, X, AlertCircle, ShieldAlert } from 'lucide-react';
import { validateProfileName, validateUsername, validatePassword } from '../../utils/authValidation';

export interface AuthModalProps {
  isOpen: boolean;
  initialTab?: 'login' | 'signup';
  onClose: () => void;
  selectedProfileForLogin?: any;
  onAuthSuccess?: (userId: string, username?: string) => void;
  initiateTraktPkceAuth?: (opts: any) => void;
  settings: any;
  setSettings: (s: any) => void;
  saveSettingsToStorage: (s: any) => void;
  videos: any[];
  setVideos: (v: any) => void;
  addToast: (msg: string, type?: 'success' | 'warning' | 'error' | any) => void;
  fetchProfiles: () => Promise<void>;
  defaultSettings?: any;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialTab = 'login',
  onClose,
  selectedProfileForLogin,
  onAuthSuccess,
  initiateTraktPkceAuth,
  settings,
  setSettings,
  saveSettingsToStorage,
  videos,
  setVideos,
  addToast,
  fetchProfiles,
  defaultSettings = {}
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);
  const [profileName, setProfileName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [understoodNoRecovery, setUnderstoodNoRecovery] = useState(false);

  // Field inline errors
  const [fieldErrors, setFieldErrors] = useState<{ profileName?: string; username?: string; password?: string }>({});
  // Form-level error
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Rate-limiting countdown in seconds
  const [retryAfter, setRetryAfter] = useState<number>(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset states on open/close and sync initialTab
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setTab(initialTab);
      }
      setFieldErrors({});
      setFormError('');
      setUnderstoodNoRecovery(false);
      setPassword('');
      if (!selectedProfileForLogin) {
        setUsername('');
        setProfileName('');
      } else {
        setUsername(selectedProfileForLogin.username || selectedProfileForLogin.name || '');
      }
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialTab, selectedProfileForLogin]);

  // Rate-limiting countdown ticker
  useEffect(() => {
    if (retryAfter <= 0) return;
    const interval = setInterval(() => {
      setRetryAfter(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setFormError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  // Esc key and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Password strength hint calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: '', color: 'transparent' };
    if (pass.length < 10) return { score: 1, text: 'Too short (min 10 characters)', color: '#ef4444' };
    if (pass.length < 12) return { score: 2, text: 'Weak', color: '#f97316' };
    if (pass.length < 16) return { score: 3, text: 'Good', color: '#eab308' };
    return { score: 4, text: 'Strong', color: '#10b981' };
  };

  const strength = getPasswordStrength(password);

  // Form submission handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting || retryAfter > 0) return;

    setFieldErrors({});
    setFormError('');

    const isSignUp = tab === 'signup' && !selectedProfileForLogin;

    // Client-side validation
    const errors: { profileName?: string; username?: string; password?: string } = {};

    if (isSignUp) {
      const nameCheck = validateProfileName(profileName);
      if (!nameCheck.valid) errors.profileName = nameCheck.error;

      const userCheck = validateUsername(username);
      if (!userCheck.valid) errors.username = userCheck.error;

      const passCheck = validatePassword(password);
      if (!passCheck.valid) errors.password = passCheck.error;

      if (!understoodNoRecovery) {
        setFormError('You must acknowledge that there is no password recovery.');
        return;
      }
    } else {
      if (!selectedProfileForLogin) {
        const userCheck = validateUsername(username);
        if (!userCheck.valid) errors.username = userCheck.error;
      }
      if (!password) {
        errors.password = 'Password is required.';
      } else if (password.length > 128) {
        errors.password = 'Password must not exceed 128 characters.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        // Sign Up Flow: POST /auth/signup
        const res = await fetch('/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileName: profileName.trim(),
            username: username.trim(),
            password
          })
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 429) {
          const waitTime = data.retryAfter || 30;
          setRetryAfter(waitTime);
          setFormError(`Too many attempts. Please try again in ${waitTime} seconds.`);
          setIsSubmitting(false);
          return;
        }

        if (!res.ok || !data.success) {
          if (data.errors) {
            setFieldErrors(data.errors);
          }
          setFormError(data.error || 'Failed to create account.');
          setIsSubmitting(false);
          return;
        }

        const newUser = data.user;
        const newUserId = newUser.id;
        const trimmedUser = newUser.username;

        localStorage.setItem('valor_active_user_id', newUserId);
        localStorage.setItem('valor_logged_in_username', trimmedUser);

        const updatedSettings = {
          ...settings,
          userId: newUserId,
          profileName: newUser.profileName,
          storageMode: 'file',
          experienceMode: 'cloud',
          isOnboarded: true
        };
        setSettings(updatedSettings);
        saveSettingsToStorage(updatedSettings);

        addToast(`Welcome @${trimmedUser}! Cloud account created.`, 'success');

        if (onAuthSuccess) {
          onAuthSuccess(newUserId, trimmedUser);
        }

        await fetchProfiles();
        onClose();
      } else {
        // Login Flow: POST /auth/login or Profile Switch
        const finalUsername = selectedProfileForLogin
          ? (selectedProfileForLogin.username || selectedProfileForLogin.name || username.trim())
          : username.trim();

        const payload: any = {
          password
        };
        if (finalUsername) payload.username = finalUsername;
        if (selectedProfileForLogin?.userId) payload.userId = selectedProfileForLogin.userId;

        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 429) {
          const waitTime = data.retryAfter || 30;
          setRetryAfter(waitTime);
          setFormError(`Too many attempts. Please try again in ${waitTime} seconds.`);
          setIsSubmitting(false);
          return;
        }

        if (!res.ok || !data.success) {
          // Hard constraint: Generic form-level error for failed login: "Incorrect username or password."
          setFormError(data.error || 'Incorrect username or password.');
          setIsSubmitting(false);
          return;
        }

        const loggedInUser = data.user;
        const targetUserId = selectedProfileForLogin?.userId || loggedInUser.id || `u_${loggedInUser.username}`;
        const targetUsername = loggedInUser.username || selectedProfileForLogin?.username || '';
        const targetProfileName = loggedInUser.profileName || selectedProfileForLogin?.name || targetUsername || 'User';

        localStorage.setItem('valor_active_user_id', targetUserId);
        if (targetUsername) {
          localStorage.setItem('valor_logged_in_username', targetUsername);
        }

        const updatedSettings = {
          ...settings,
          userId: targetUserId,
          profileName: targetProfileName,
          storageMode: 'file',
          experienceMode: 'cloud',
          isOnboarded: true
        };
        setSettings(updatedSettings);
        saveSettingsToStorage(updatedSettings);

        // Fetch watch history and profile data
        try {
          const profileDataRes = await fetch(`/api/profile/data?userId=${targetUserId}`);
          const profileData = await profileDataRes.json().catch(() => null);
          if (profileData && profileData.settings) {
            const merged = {
              ...defaultSettings,
              ...profileData.settings,
              userId: targetUserId,
              profileName: targetProfileName,
              storageMode: 'file'
            };
            setSettings(merged);
            saveSettingsToStorage(merged);
          }
          if (profileData && Array.isArray(profileData.history)) {
            setVideos(profileData.history);
          } else {
            const historyRes = await fetch(`/api/history?userId=${targetUserId}`);
            const hist = await historyRes.json().catch(() => null);
            if (Array.isArray(hist)) {
              setVideos(hist);
            }
          }
        } catch {}

        if (selectedProfileForLogin) {
          addToast(`Switched to profile: ${targetProfileName}`, 'success');
        } else {
          addToast(`Signed in successfully as @${targetUsername || targetProfileName}`, 'success');
        }

        if (onAuthSuccess) {
          onAuthSuccess(targetUserId, targetUsername);
        }

        await fetchProfiles();
        onClose();
      }
    } catch (err: any) {
      setFormError(err.message || 'Authentication failed. Please check connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSignUp = tab === 'signup' && !selectedProfileForLogin;
  const isSubmitDisabled = isSubmitting || retryAfter > 0 || (isSignUp && !understoodNoRecovery);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          width: '420px',
          maxWidth: '100%',
          backgroundColor: '#121622',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.12)',
          overflow: 'hidden',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          position: 'relative',
          fontFamily: 'Outfit, sans-serif'
        }}
      >
        {/* Close (X) button with WCAG >= 44px touch target */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            minWidth: '44px',
            minHeight: '44px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            borderRadius: '50%',
            transition: 'color 0.2s, background-color 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <X size={20} />
        </button>

        {/* Modal Header with Avatar */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              marginBottom: '2px'
            }}
          >
            <ShieldAlert size={22} color="#ffffff" />
          </div>
          <h2
            id="auth-modal-title"
            style={{
              margin: 0,
              fontSize: '1.35rem',
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: 'Outfit, sans-serif',
              letterSpacing: '-0.3px'
            }}
          >
            {selectedProfileForLogin ? 'Unlock Profile' : 'Log in or create account'}
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            {selectedProfileForLogin
              ? `Enter credentials for @${selectedProfileForLogin.username || selectedProfileForLogin.name}`
              : 'Sync your watch history and preferences across devices'}
          </span>
        </div>

        {/* Modern Segmented Tabs: Login & Sign Up */}
        {!selectedProfileForLogin && (
          <div
            role="tablist"
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '4px',
              gap: '4px',
              marginTop: '2px'
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => { setTab('login'); setFormError(''); setFieldErrors({}); }}
              style={{
                flex: 1,
                background: tab === 'login' ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : 'transparent',
                border: 'none',
                color: tab === 'login' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                padding: '8px 16px',
                minHeight: '38px',
                borderRadius: '8px',
                fontFamily: 'Outfit, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: tab === 'login' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none'
              }}
            >
              Login
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              onClick={() => { setTab('signup'); setFormError(''); setFieldErrors({}); }}
              style={{
                flex: 1,
                background: tab === 'signup' ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : 'transparent',
                border: 'none',
                color: tab === 'signup' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                padding: '8px 16px',
                minHeight: '38px',
                borderRadius: '8px',
                fontFamily: 'Outfit, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: tab === 'signup' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none'
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Top row button: Continue with Trakt.tv */}
        {!selectedProfileForLogin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (initiateTraktPkceAuth) {
                  initiateTraktPkceAuth({ isLoginAction: true });
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                minHeight: '44px',
                background: 'linear-gradient(135deg, rgba(237, 28, 36, 0.15) 0%, rgba(185, 28, 28, 0.2) 100%)',
                border: '1px solid rgba(237, 28, 36, 0.4)',
                color: '#ff4d4f',
                padding: '10px 16px',
                borderRadius: '10px',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(237, 28, 36, 0.12)',
                transition: 'all 0.2s ease',
                fontFamily: 'Outfit, sans-serif'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(237, 28, 36, 0.25) 0%, rgba(185, 28, 28, 0.3) 100%)';
                e.currentTarget.style.borderColor = 'rgba(237, 28, 36, 0.65)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(237, 28, 36, 0.15) 0%, rgba(185, 28, 28, 0.2) 100%)';
                e.currentTarget.style.borderColor = 'rgba(237, 28, 36, 0.4)';
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ed1c24',
                  boxShadow: '0 0 8px #ed1c24'
                }}
              />
              <span>Continue with Trakt.tv</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  background: 'rgba(34, 197, 94, 0.16)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginLeft: 'auto',
                  fontWeight: 700
                }}
              >
                PKCE S256
              </span>
            </button>

            {/* Divider text: OR WITH CREDENTIALS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
              <span
                style={{
                  fontSize: '0.68rem',
                  color: 'rgba(255, 255, 255, 0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.75px',
                  fontWeight: 600
                }}
              >
                OR WITH CREDENTIALS
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            </div>
          </div>
        )}

        {/* Form-level Error / Rate Limit Banner */}
        {formError && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.82rem',
              padding: '10px 14px',
              borderRadius: '8px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'Outfit, sans-serif'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Profile Name (Sign Up only) */}
          {isSignUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label
                htmlFor="auth-profile-name"
                style={{
                  fontSize: '0.82rem',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontWeight: 600,
                  fontFamily: 'Outfit, sans-serif'
                }}
              >
                Profile Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                ref={tab === 'signup' ? firstInputRef : undefined}
                id="auth-profile-name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Living Room, Alex..."
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                style={{
                  minHeight: '44px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: fieldErrors.profileName
                    ? '1.5px solid #ef4444'
                    : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.9rem',
                  color: '#ffffff',
                  outline: 'none',
                  fontFamily: 'Outfit, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              {fieldErrors.profileName && (
                <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>
                  {fieldErrors.profileName}
                </span>
              )}
            </div>
          )}

          {/* Username */}
          {!selectedProfileForLogin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label
                htmlFor="auth-username"
                style={{
                  fontSize: '0.82rem',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontWeight: 600,
                  fontFamily: 'Outfit, sans-serif'
                }}
              >
                Username <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                ref={tab === 'login' ? firstInputRef : undefined}
                id="auth-username"
                type="text"
                autoComplete="username"
                placeholder="Enter username (3-24 characters)..."
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{
                  minHeight: '44px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: fieldErrors.username
                    ? '1.5px solid #ef4444'
                    : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.9rem',
                  color: '#ffffff',
                  outline: 'none',
                  fontFamily: 'Outfit, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              {fieldErrors.username && (
                <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>
                  {fieldErrors.username}
                </span>
              )}
            </div>
          )}

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label
              htmlFor="auth-password"
              style={{
                fontSize: '0.82rem',
                color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: 600,
                fontFamily: 'Outfit, sans-serif'
              }}
            >
              Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                ref={selectedProfileForLogin ? firstInputRef : undefined}
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: fieldErrors.password
                    ? '1.5px solid #ef4444'
                    : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 48px 10px 14px',
                  fontSize: '0.9rem',
                  color: '#ffffff',
                  outline: 'none',
                  fontFamily: 'Outfit, sans-serif',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '2px',
                  minWidth: '44px',
                  minHeight: '44px',
                  width: '44px',
                  height: '44px',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px'
                }}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>
                {fieldErrors.password}
              </span>
            )}

            {/* Simple password strength hint (Sign Up only) */}
            {isSignUp && password.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(strength.score / 4) * 100}%`,
                      background: strength.color,
                      transition: 'all 0.3s ease'
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.72rem', color: strength.color, fontWeight: 600 }}>
                  {strength.text}
                </span>
              </div>
            )}
          </div>

          {/* Under password notice & acknowledgment (Sign Up only) */}
          {isSignUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}
              >
                <ShieldAlert size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: 'rgba(255, 255, 255, 0.85)',
                    lineHeight: 1.45,
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  There is no password reset. If you lose your password, this account can't be recovered. Store it somewhere safe.
                </span>
              </div>

              {/* Inline acknowledgment checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  minHeight: '44px',
                  userSelect: 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={understoodNoRecovery}
                  onChange={e => setUnderstoodNoRecovery(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#6366f1'
                  }}
                />
                <span style={{ fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>
                  I understand there is no password recovery
                </span>
              </label>
            </div>
          )}

          {/* Primary Action Button (Sign in / Create account) */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            style={{
              width: '100%',
              minHeight: '44px',
              background: isSubmitDisabled
                ? 'rgba(255, 255, 255, 0.1)'
                : 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
              border: 'none',
              color: isSubmitDisabled ? 'rgba(255, 255, 255, 0.35)' : '#ffffff',
              padding: '12px 20px',
              fontSize: '0.92rem',
              borderRadius: '10px',
              cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              marginTop: '8px',
              transition: 'opacity 0.2s, transform 0.1s',
              fontFamily: 'Outfit, sans-serif',
              boxShadow: isSubmitDisabled ? 'none' : '0 4px 18px rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{selectedProfileForLogin ? 'Verifying & Switching...' : isSignUp ? 'Creating account...' : 'Signing in...'}</span>
              </>
            ) : retryAfter > 0 ? (
              <span>Retry in {retryAfter}s</span>
            ) : (
              <span>{selectedProfileForLogin ? 'Unlock & Switch' : isSignUp ? 'Create account' : 'Sign in'}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
