import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, KeyRound, Eye, EyeOff, AlertCircle, X, ShieldCheck, Loader2 } from 'lucide-react';
import { getHostKey } from '../services/remote/mediaAuthStore';

interface MediaAuthModalProps {
  isOpen: boolean;
  url: string;
  initialUsername?: string;
  errorMessage?: string | null;
  isLoading?: boolean;
  onSubmit: (creds: { username: string; password: string; remember: boolean }) => void;
  onCancel: () => void;
}

export const MediaAuthModal: React.FC<MediaAuthModalProps> = ({
  isOpen,
  url,
  initialUsername = '',
  errorMessage,
  isLoading = false,
  onSubmit,
  onCancel
}) => {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const hostname = getHostKey(url);

  useEffect(() => {
    if (isOpen) {
      if (initialUsername) {
        setUsername(initialUsername);
        setTimeout(() => passwordInputRef.current?.focus(), 80);
      } else {
        setTimeout(() => usernameInputRef.current?.focus(), 80);
      }
    }
  }, [isOpen, initialUsername]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || isLoading) return;
    onSubmit({
      username: username.trim(),
      password,
      remember
    });
  };

  return (
    <div className="media-auth-backdrop" onClick={onCancel}>
      <style>{`
        @keyframes authFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes authScaleIn {
          from { transform: scale(0.92) translateY(8px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .media-auth-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          box-sizing: border-box;
          animation: authFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .media-auth-card {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: #13161f;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.05);
          overflow: hidden;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          animation: authScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
        }
        .media-auth-top-bar {
          height: 3px;
          width: 100%;
          background: linear-gradient(90deg, #f59e0b, #fbbf24, #f97316);
        }
        .media-auth-body {
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          box-sizing: border-box;
        }
        .media-auth-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }
        .media-auth-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #fbbf24;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .media-auth-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 4px 0;
          letter-spacing: -0.01em;
        }
        .media-auth-subtitle {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 8px 0;
          line-height: 1.35;
        }
        .media-auth-domain-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 0.72rem;
          color: #fbbf24;
          font-family: monospace;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .media-auth-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .media-auth-close-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .media-auth-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 10px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          font-size: 0.8rem;
          line-height: 1.3;
        }
        .media-auth-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .media-auth-label {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.65);
        }
        .media-auth-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .media-auth-input-icon {
          position: absolute;
          left: 12px;
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .media-auth-input {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 14px 10px 38px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 10px;
          color: #ffffff;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }
        .media-auth-input:focus {
          border-color: #f59e0b;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22);
          background: rgba(255, 255, 255, 0.09);
        }
        .media-auth-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .media-auth-eye-btn {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          padding: 4px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }
        .media-auth-eye-btn:hover {
          color: #ffffff;
        }
        .media-auth-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          user-select: none;
          padding-top: 2px;
        }
        .media-auth-checkbox {
          width: 15px;
          height: 15px;
          border-radius: 4px;
          accent-color: #f59e0b;
          cursor: pointer;
        }
        .media-auth-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 6px;
        }
        .media-auth-cancel-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.75);
          border-radius: 10px;
          padding: 9px 16px;
          font-size: 0.85rem;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.15s;
        }
        .media-auth-cancel-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .media-auth-submit-btn {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: none;
          color: #0b0c10;
          border-radius: 10px;
          padding: 9px 20px;
          font-size: 0.85rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
          transition: all 0.15s;
        }
        .media-auth-submit-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(245, 158, 11, 0.45);
        }
        .media-auth-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .media-auth-submit-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>

      <div className="media-auth-card" onClick={e => e.stopPropagation()}>
        <div className="media-auth-top-bar" />

        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="media-auth-close-btn"
          title="Cancel"
        >
          <X size={18} />
        </button>

        <form onSubmit={handleSubmit} className="media-auth-body">
          <div className="media-auth-header">
            <div className="media-auth-icon-badge">
              <Lock size={22} />
            </div>
            <div>
              <h2 className="media-auth-title">Authentication Required</h2>
              <p className="media-auth-subtitle">
                This media server requires credentials for HTTP Basic Authentication.
              </p>
              <div className="media-auth-domain-pill">
                <ShieldCheck size={12} />
                <span>{hostname}</span>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="media-auth-error">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="media-auth-field">
            <label className="media-auth-label">Username</label>
            <div className="media-auth-input-wrapper">
              <div className="media-auth-input-icon">
                <User size={16} />
              </div>
              <input
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={isLoading}
                required
                className="media-auth-input"
              />
            </div>
          </div>

          <div className="media-auth-field">
            <label className="media-auth-label">Password</label>
            <div className="media-auth-input-wrapper">
              <div className="media-auth-input-icon">
                <KeyRound size={16} />
              </div>
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isLoading}
                className="media-auth-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="media-auth-eye-btn"
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="media-auth-checkbox-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              disabled={isLoading}
              className="media-auth-checkbox"
            />
            <span>Remember credentials for this server</span>
          </label>

          <div className="media-auth-actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="media-auth-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!username.trim() || isLoading}
              className="media-auth-submit-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>Unlock &amp; Play</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
