import defaultFeatures from '../config/features.json';

export interface FeatureConfig {
  enabled: boolean;
  title: string;
  maintenanceMessage: string;
}

export interface FeaturesState {
  app: FeatureConfig;
  onlineStream: FeatureConfig;
  localEngine: FeatureConfig;
}

const STORAGE_KEY = 'valor_feature_overrides';

class FeatureFlagService {
  private features: FeaturesState = { ...defaultFeatures };
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    // 1. Start with config file defaults
    this.features = JSON.parse(JSON.stringify(defaultFeatures));

    // 2. Check client localStorage overrides if present (developer / testing overrides)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.features = {
            ...this.features,
            ...parsed
          };
        }
      } catch {}
    }

    // 3. Build-time environment variables (takes precedence over localStorage)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_DISABLE_APP === 'true') {
        this.features.app.enabled = false;
      }
      if (import.meta.env.VITE_DISABLE_ONLINE === 'true') {
        this.features.onlineStream.enabled = false;
      }
      if (import.meta.env.VITE_DISABLE_ENGINE === 'true') {
        this.features.localEngine.enabled = false;
      }
    }

    // 4. Check URL query parameters (highest priority for testing & manual links)
    if (typeof window !== 'undefined' && window.location) {
      try {
        const params = new URLSearchParams(window.location.search);
        
        // ?disable=online,engine,app
        const disabled = params.get('disable')?.toLowerCase().split(',') || [];
        if (disabled.includes('app') || params.get('maintenance') === 'true') {
          this.features.app.enabled = false;
        }
        if (disabled.includes('online') || disabled.includes('stream') || disabled.includes('online-stream')) {
          this.features.onlineStream.enabled = false;
        }
        if (disabled.includes('engine') || disabled.includes('companion') || disabled.includes('local-engine')) {
          this.features.localEngine.enabled = false;
        }

        // ?enable=all or ?enable=online,engine,app
        const enabled = params.get('enable')?.toLowerCase().split(',') || [];
        if (enabled.includes('all')) {
          this.features.app.enabled = true;
          this.features.onlineStream.enabled = true;
          this.features.localEngine.enabled = true;
        } else {
          if (enabled.includes('app')) this.features.app.enabled = true;
          if (enabled.includes('online')) this.features.onlineStream.enabled = true;
          if (enabled.includes('engine')) this.features.localEngine.enabled = true;
        }
      } catch {}
    }
  }

  public getFeatures(): FeaturesState {
    return this.features;
  }

  public isAppDisabled(): boolean {
    return !this.features.app.enabled;
  }

  public isOnlineDisabled(): boolean {
    return !this.features.onlineStream.enabled;
  }

  public isEngineDisabled(): boolean {
    return !this.features.localEngine.enabled;
  }

  public setFeatureState(feature: 'app' | 'onlineStream' | 'localEngine', enabled: boolean, saveToStorage: boolean = true) {
    if (this.features[feature]) {
      this.features[feature].enabled = enabled;
      if (saveToStorage && typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.features));
        } catch {}
      }
      this.notify();
    }
  }

  public resetAll(saveToStorage: boolean = true) {
    this.features = JSON.parse(JSON.stringify(defaultFeatures));
    if (saveToStorage && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch (e) {
        console.error('[FeatureFlagService] listener error:', e);
      }
    });
  }
}

export const featureFlagService = new FeatureFlagService();
