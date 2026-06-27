import {
  IconArchive,
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconDots,
  IconMail,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent } from './ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from '../lib/utils';
import { CustomSelect } from './CustomSelect';

const initialSteps = [
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
    description: 'Set your preferred default audio track and subtitle language.',
    completed: false,
    actionLabel: 'Save Preferences',
    actionHref: '#'
  },
  {
    id: 'keybinds',
    title: 'Keyboard Controls Profile',
    description: 'Review default keyboard hotkeys for player controls.',
    completed: false,
    actionLabel: 'Acknowledge Hotkeys',
    actionHref: '#'
  },
  {
    id: 'ready',
    title: 'Ready to stream!',
    description: 'You are all set to start using Valor.',
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
    <svg
      className="-rotate-90"
      height="14"
      viewBox="0 0 14 14"
      width="14"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle
        cx="7"
        cy="7"
        fill="none"
        r="6"
        strokeWidth="2"
        stroke="rgba(255,255,255,0.12)"
      />
      <circle
        cx="7"
        cy="7"
        fill="none"
        r="6"
        strokeDasharray="100"
        strokeLinecap="round"
        strokeWidth="2"
        stroke="#3b82f6"
        style={{ strokeDashoffset }}
      />
    </svg>
  );
}

function StepIndicator({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <IconCircleCheckFilled
        aria-hidden="true"
        className="mt-1 size-4.5 shrink-0 text-primary"
        style={{ width: '18px', height: '18px', color: '#3b82f6' }}
      />
    );
  }
  return (
    <IconCircleDashed
      aria-hidden="true"
      className="mt-1 size-5 shrink-0 stroke-muted-foreground/40"
      strokeWidth={2}
      style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.25)' }}
    />
  );
}

export function Onboarding01({
  settings,
  handleDefaultLangChange,
  audioOptions,
  subOptions,
  onComplete,
}: Onboarding01Props) {
  const [currentSteps, setCurrentSteps] = useState<OnboardingStep[]>(initialSteps);
  const [openStepId, setOpenStepId] = useState<string | null>(() => {
    const firstIncomplete = initialSteps.find((s) => !s.completed);
    return firstIncomplete?.id ?? initialSteps[0]?.id ?? null;
  });
  const [dismissed, setDismissed] = useState(false);

  // Configuration tracking to prevent moving forward without configuring
  const [hasConfiguredStorage, setHasConfiguredStorage] = useState(false);
  const [hasConfiguredLanguages, setHasConfiguredLanguages] = useState(false);

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

  const isStepConfigured = (stepId: string) => {
    if (stepId === 'storage') return hasConfiguredStorage;
    if (stepId === 'languages') return hasConfiguredLanguages;
    return true; // Hotkeys and Ready steps require no special setup to proceed
  };

  const renderValorControls = (stepId: string) => {
    if (stepId === 'storage') {
      return (
        <div style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem', paddingTop: '6px' }}>
            {/* Local Storage option with Default floating badge and star icon */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.6rem', background: '#3b82f6', color: '#fff', padding: '1px 5px', borderRadius: '3px', position: 'absolute', top: '-9px', left: '10px', fontWeight: 600, zIndex: 1, display: 'flex', alignItems: 'center', gap: '3px', letterSpacing: '0.3px' }}>
                <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                DEFAULT
              </span>
              <button
                type="button"
                onClick={() => {
                  handleDefaultLangChange('storageMode', 'localstorage');
                  setHasConfiguredStorage(true);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem',
                  border: settings.storageMode === 'localstorage' && hasConfiguredStorage ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                  background: settings.storageMode === 'localstorage' && hasConfiguredStorage ? 'rgba(59,130,246,0.12)' : 'rgba(0,0,0,0.3)',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}
              >
                Local Storage
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => {
                handleDefaultLangChange('storageMode', 'file');
                setHasConfiguredStorage(true);
              }}
              style={{
                flex: 1,
                padding: '0.45rem',
                border: settings.storageMode === 'file' && hasConfiguredStorage ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                background: settings.storageMode === 'file' && hasConfiguredStorage ? 'rgba(59,130,246,0.12)' : 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                alignSelf: 'flex-end'
              }}
            >
              Server File
            </button>
          </div>
        </div>
      );
    }
    if (stepId === 'languages') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Audio Language</span>
            <CustomSelect
              value={settings.defaultAudio}
              onChange={(val) => {
                handleDefaultLangChange('defaultAudio', val);
                setHasConfiguredLanguages(true);
              }}
              options={audioOptions}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Subtitle Language</span>
            <CustomSelect
              value={settings.defaultSub}
              onChange={(val) => {
                handleDefaultLangChange('defaultSub', val);
                setHasConfiguredLanguages(true);
              }}
              options={subOptions}
            />
          </div>
        </div>
      );
    }
    if (stepId === 'keybinds') {
      return (
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '0.75rem', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>Play/Pause: <b>Space</b></div>
          <div>Fullscreen: <b>F</b></div>
          <div>Lock Player: <b>W</b></div>
          <div>Exit / Back: <b>Esc</b></div>
        </div>
      );
    }
    return null;
  };

  if (dismissed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'rgba(8, 8, 8, 0.85)', padding: '1rem' }}>
        <div className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p className="text-pretty text-muted-foreground" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Checklist dismissed
          </p>
          <button
            className="mt-2 text-primary text-sm underline"
            style={{ marginTop: '0.5rem', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={() => setDismissed(false)}
          >
            Show again
          </button>
          <button
            className="mt-2 text-primary text-sm underline"
            style={{ marginTop: '0.5rem', color: '#2ecc71', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={onComplete}
          >
            Finish Setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'rgba(8, 8, 8, 0.85)', padding: '1rem', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      {/* Stylesheet to ensure pointer hand (cursor pointer) when hovering over all onboarding components and items */}
      <style>{`
        .onboarding-step-row,
        .onboarding-step-container,
        .onboarding-step-inner,
        .onboarding-step-header,
        .step-dot-wrapper,
        .step-title-wrapper,
        .dropdown-item,
        .btn {
          cursor: pointer !important;
        }
      `}</style>
      
      <div className="w-full max-w-lg" style={{ width: '100%', maxWidth: '480px' }}>
        <div className="w-md rounded-lg border bg-card p-4 text-card-foreground shadow-xs" style={{ background: '#181818', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem', color: '#fff', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
          <div className="mr-2 mb-4 flex flex-col justify-between sm:flex-row sm:items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
            <h3 className="ml-2 text-balance font-semibold text-foreground" style={{ margin: 0, marginLeft: '0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>
              Get started with Valor
            </h3>
            <div className="mt-2 flex items-center justify-end sm:mt-0" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CircularProgress
                completed={remainingCount}
                total={currentSteps.length}
              />
              <div className="mr-3 ml-1.5 text-muted-foreground text-sm" style={{ marginRight: '0.75rem', marginLeft: '0.375rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                <span className="font-medium text-foreground" style={{ fontWeight: 600, color: '#fff' }}>
                  {completedCount}
                </span>
                {' / '}
                <span className="font-medium text-foreground" style={{ fontWeight: 600, color: '#fff' }}>
                  {currentSteps.length}
                </span>{' '}
                completed
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-6 w-6" size="icon" variant="ghost" style={{ width: '24px', height: '24px', padding: 0 }}>
                    <IconDots aria-hidden="true" className="h-4 w-4 shrink-0" style={{ width: '16px', height: '16px' }} />
                    <span className="sr-only">Options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setDismissed(true)}>
                    <IconArchive
                      aria-hidden="true"
                      className="mr-2 h-4 w-4 shrink-0"
                      style={{ width: '14px', height: '14px', marginRight: '8px' }}
                    />
                    Dismiss
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      window.open('mailto:support@valor.com?subject=Feedback')
                    }
                  >
                    <IconMail
                      aria-hidden="true"
                      className="mr-2 h-4 w-4 shrink-0"
                      style={{ width: '14px', height: '14px', marginRight: '8px' }}
                    />
                    Give feedback
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-0" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {currentSteps.map((step, index) => {
              const isOpen = openStepId === step.id;
              const isFirst = index === 0;
              const prevStep = currentSteps[index - 1];
              const isPrevOpen = prevStep && openStepId === prevStep.id;

              const showBorderTop = !(isFirst || isOpen || isPrevOpen);
              const isConfigured = isStepConfigured(step.id);

              return (
                <div
                  className={cn(
                    'group',
                    isOpen && 'rounded-lg',
                    showBorderTop && 'border-border border-t'
                  )}
                  style={{
                    borderTop: showBorderTop ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    borderRadius: isOpen ? '8px' : 0
                  }}
                  key={step.id}
                >
                  <div
                    className={cn(
                      'block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      isOpen && 'rounded-lg'
                    )}
                    onClick={() => handleStepClick(step.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleStepClick(step.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{ outline: 'none' }}
                  >
                    <div
                      className={cn(
                        'relative rounded-lg transition-colors',
                        isOpen && 'border border-border bg-muted'
                      )}
                      style={{
                        position: 'relative',
                        overflow: 'visible',
                        borderRadius: '8px',
                        border: isOpen ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                        background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
                        margin: isOpen ? '4px 0' : 0
                      }}
                    >
                      <div className="relative flex items-center justify-between gap-3 py-3 pr-2 pl-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.5rem 0.75rem 1rem', gap: '12px' }}>
                        <div className="flex w-full gap-3" style={{ display: 'flex', width: '100%', gap: '12px' }}>
                          <div className="shrink-0" style={{ flexShrink: 0 }}>
                            <StepIndicator completed={step.completed} />
                          </div>
                          <div className="mt-0.5 grow" style={{ flexGrow: 1, minWidth: 0, marginTop: '2px' }}>
                            <h4
                              className={cn(
                                'font-semibold',
                                step.completed
                                  ? 'text-primary'
                                  : 'text-foreground'
                              )}
                              style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: step.completed ? '#3b82f6' : '#fff' }}
                            >
                              {step.title}
                            </h4>
                            <Collapsible open={isOpen}>
                              <CollapsibleContent>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <p className="mt-2 text-pretty text-muted-foreground text-sm sm:max-w-64 md:max-w-xs" style={{ margin: 0, marginTop: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
                                    {step.description}
                                  </p>
                                  {renderValorControls(step.id)}
                                  <Button
                                    asChild
                                    className="mt-3"
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      if (!isConfigured) return;
                                      handleStepAction(step);
                                    }}
                                    size="sm"
                                    style={{
                                      marginTop: '12px',
                                      padding: '0.35rem 0.85rem',
                                      fontSize: '0.8rem',
                                      opacity: isConfigured ? 1 : 0.4,
                                      cursor: isConfigured ? 'pointer' : 'not-allowed'
                                    }}
                                  >
                                    <span style={{ cursor: isConfigured ? 'pointer' : 'not-allowed' }}>
                                      {step.actionLabel}
                                    </span>
                                  </Button>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        </div>
                        {!isOpen && (
                          <IconChevronRight
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
