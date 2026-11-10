import React, { useState, useEffect, useRef } from 'react';
import { HardDrive, Cloud, Check, Eye, EyeOff, Loader2, X, AlertCircle, ShieldAlert, UserPlus } from 'lucide-react';
import { validateProfileName, validateUsername, validatePassword } from '../../utils/authValidation';

export interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: any;
  setSettings: (s: any) => void;
  saveSettingsToStorage: (s: any) => void;
  setVideos: (v: any) => void;
  addToast: (msg: string, type?: 'success' | 'warning' | 'error' | any) => void;
  fetchProfiles: () => Promise<void>;
  defaultSettings?: any;
  onAuthSuccess?: (userId: string, username?: string) => void;
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  settings,
  setSettings,
  saveSettingsToStorage,
  setVideos,
  addToast,
  fetchProfiles,
  defaultSettings = {},
  onAuthSuccess
}) => {
  const [accountType, setAccountType] = useState<'local' | 'cloud'>('local');
  const [profileName, setProfileName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [understoodNoRecovery, setUnderstoodNoRecovery] = useState(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<{ profileName?: string; username?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setFormError('');
      setProfileName('');
      setUsername('');
      setPassword('');
      setUnderstoodNoRecovery(false);
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, accountType]);

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting || retryAfter > 0) return;

    setFieldErrors({});
    setFormError('');

    const errors: { profileName?: string; username?: string; password?: string } = {};

    const nameCheck = validateProfileName(profileName);
    if (!nameCheck.valid) errors.profileName = nameCheck.error;

    if (accountType === 'cloud') {
      const userCheck = validateUsername(username);
      if (!userCheck.valid) errors.username = userCheck.error;

      const passCheck = validatePassword(password);
      if (!passCheck.valid) errors.password = passCheck.error;

      if (!understoodNoRecovery) {
        setFormError('You must acknowledge that there is no password recovery.');
        return;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (accountType === 'local') {
        // Create Local Account (OFFLINE, IndexedDB / Browser storage)
        const newUserId = 'local_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('valor_active_user_id', newUserId);

        let localProfiles = [];
        try {
          const localSaved = localStorage.getItem('valor_local_profiles');
          if (localSaved) localProfiles = JSON.parse(localSaved);
        } catch {}

        const newProfile = {
          userId: newUserId,
          name: profileName.trim(),
          storageMode: 'localstorage',
          hasPassword: false
        };
        localProfiles.push(newProfile);
        localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));

        const newSettings = {
          ...defaultSettings,
          profileName: profileName.trim(),
          userId: newUserId,
          storageMode: 'localstorage' as const,
          experienceMode: 'local' as const,
          isOnboarded: true
        };

        try {
          localStorage.setItem(`valor_settings_${newUserId}`, JSON.stringify(newSettings));
        } catch {}

        setSettings(newSettings);
        setVideos([]);
        addToast(`Successfully created Local Profile: ${profileName.trim()}`, 'success');

        if (onAuthSuccess) {
          onAuthSuccess(newUserId);
        }

        await fetchProfiles();
        onClose();
      } else {
        // Create Cloud Account & Sync (PostgreSQL + Redis)
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
          setFormError(data.error || 'Failed to create cloud account.');
          setIsSubmitting(false);
          return;
        }

        const newUser = data.user;
        const newUserId = newUser.id;
        const trimmedUser = newUser.username;

        localStorage.setItem('valor_active_user_id', newUserId);
        localStorage.setItem('valor_logged_in_username', trimmedUser);

        const newSettings = {
          ...defaultSettings,
          userId: newUserId,
          profileName: profileName.trim(),
          storageMode: 'file' as const,
          experienceMode: 'cloud' as const,
          isOnboarded: true
        };

        setSettings(newSettings);
        saveSettingsToStorage(newSettings);
        setVideos([]);
        addToast(`Successfully created Cloud Account: @${trimmedUser}`, 'success');

        if (onAuthSuccess) {
          onAuthSuccess(newUserId, trimmedUser);
        }

        await fetchProfiles();
        onClose();
      }
    } catch (err: any) {
      setFormError(err.message || 'Account creation failed. Please check network.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled = isSubmitting || retryAfter > 0 || (accountType === 'cloud' && !understoodNoRecovery);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-account-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
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
          width: '540px',
          maxWidth: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: '#121622',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.12)',
          padding: '30px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          position: 'relative',
          fontFamily: 'Outfit, sans-serif'
        }}
      >
        {/* Close Button with >= 44px touch target */}
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

        {/* Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              color: '#ffffff',
              marginBottom: '4px'
            }}
          >
            <UserPlus size={22} color="#ffffff" />
          </div>
          <h2
            id="create-account-title"
            style={{
              margin: 0,
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: 'Outfit, sans-serif'
            }}
          >
            Create Account
          </h2>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
            Choose where your watch history, settings, and media library are stored.
          </p>
        </div>

        {/* Two Selectable Cards: Local Account vs Cloud Account */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '2px'
          }}
        >
          {/* Card 1: Local Account */}
          <div
            role="radio"
            aria-checked={accountType === 'local'}
            tabIndex={0}
            onClick={() => { setAccountType('local'); setFormError(''); setFieldErrors({}); }}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { setAccountType('local'); } }}
            style={{
              background: accountType === 'local' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: accountType === 'local' ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: accountType === 'local' ? '0 0 16px rgba(16, 185, 129, 0.18)' : 'none',
              borderRadius: '12px',
              padding: '14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.18)',
                  color: '#10b981',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase'
                }}
              >
                OFFLINE
              </div>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: accountType === 'local' ? 'none' : '1.5px solid rgba(255, 255, 255, 0.3)',
                  background: accountType === 'local' ? '#10b981' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {accountType === 'local' && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <HardDrive size={18} color="#10b981" />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                Local Account
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.35 }}>
              Private browser sandbox (IndexedDB). Zero cloud latency, works completely offline.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginTop: '4px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '0.7rem',
                color: '#d1d5db'
              }}
            >
              <span>✓ 100% In-Browser Private</span>
              <span>✓ No Password Required</span>
            </div>
          </div>

          {/* Card 2: Cloud Account */}
          <div
            role="radio"
            aria-checked={accountType === 'cloud'}
            tabIndex={0}
            onClick={() => { setAccountType('cloud'); setFormError(''); setFieldErrors({}); }}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { setAccountType('cloud'); } }}
            style={{
              background: accountType === 'cloud' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              border: accountType === 'cloud' ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: accountType === 'cloud' ? '0 0 16px rgba(99, 102, 241, 0.22)' : 'none',
              borderRadius: '12px',
              padding: '14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#818cf8',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase'
                }}
              >
                CLOUD SYNC
              </div>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: accountType === 'cloud' ? 'none' : '1.5px solid rgba(255, 255, 255, 0.3)',
                  background: accountType === 'cloud' ? '#6366f1' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {accountType === 'cloud' && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <Cloud size={18} color="#818cf8" />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                Cloud Account
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.35 }}>
              PostgreSQL 16 persistence + Redis cache-aside. Multi-device sync & instant login.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginTop: '4px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '0.7rem',
                color: '#d1d5db'
              }}
            >
              <span>✓ PostgreSQL 16 Persistence</span>
              <span>✓ Redis Cache-Aside Speed</span>
            </div>
          </div>
        </div>

        {/* Form-level Error Message */}
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
              gap: '8px'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        {/* Input Fields */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Profile Name (Required for both local and cloud) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label
              htmlFor="create-profile-name"
              style={{
                fontSize: '0.82rem',
                color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: 600
              }}
            >
              Profile Name <span style={{ color: accountType === 'local' ? '#10b981' : '#ef4444' }}>*</span>
            </label>
            <input
              ref={firstInputRef}
              id="create-profile-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Living Room, John, Personal..."
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

          {/* Cloud Account specific fields: Username, Password, Notice & Checkbox */}
          {accountType === 'cloud' && (
            <>
              {/* Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label
                  htmlFor="create-username"
                  style={{
                    fontSize: '0.82rem',
                    color: 'rgba(255, 255, 255, 0.85)',
                    fontWeight: 600
                  }}
                >
                  Username <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="create-username"
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

              {/* Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label
                  htmlFor="create-password"
                  style={{
                    fontSize: '0.82rem',
                    color: 'rgba(255, 255, 255, 0.85)',
                    fontWeight: 600
                  }}
                >
                  Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="create-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
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

                {/* Password strength hint */}
                {password.length > 0 && (
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

              {/* Security Notice */}
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
            </>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                minHeight: '44px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#d1d5db',
                padding: '12px',
                fontSize: '0.9rem',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontFamily: 'Outfit, sans-serif',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitDisabled}
              style={{
                flex: 1.5,
                minHeight: '44px',
                background: isSubmitDisabled
                  ? 'rgba(255, 255, 255, 0.1)'
                  : accountType === 'local'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'linear-gradient(135deg, #6366f1, #7c3aed)',
                border: 'none',
                color: isSubmitDisabled ? 'rgba(255, 255, 255, 0.35)' : '#ffffff',
                padding: '12px 18px',
                fontSize: '0.9rem',
                borderRadius: '10px',
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontFamily: 'Outfit, sans-serif',
                boxShadow: isSubmitDisabled
                  ? 'none'
                  : accountType === 'local'
                  ? '0 4px 15px rgba(16, 185, 129, 0.35)'
                  : '0 4px 18px rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'opacity 0.2s'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Creating...</span>
                </>
              ) : retryAfter > 0 ? (
                <span>Retry in {retryAfter}s</span>
              ) : accountType === 'local' ? (
                <span>Create Local Account</span>
              ) : (
                <span>Create Cloud Account & Sync</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
