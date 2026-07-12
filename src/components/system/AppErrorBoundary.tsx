import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { AlertIcon } from '@/components/icons';

// =====================================================================
// AppErrorBoundary — Phase 2. Catches any uncaught render/lifecycle
// error below it and swaps the broken tree for a calm, translated
// crash screen instead of React's blank unmount.
//
// * A short support code (LND-…) is generated per crash and shown with
//   a copy button. It is also logged next to the full error, so a user
//   report ("it crashed, code LND-…") can be matched to console/device
//   logs. When crash reporting lands (Phase 6) the same code becomes
//   the correlation id sent to the reporter.
// * Recovery is a full reload — the most reliable reset for an app
//   whose state is server-authoritative. No mutation RPCs are called.
// * Mounted in App.tsx INSIDE the Language/Auth providers (so the
//   fallback can translate) and around AppRoutes + the session
//   overlays. A crash inside the providers themselves is not
//   catchable from here — acceptable: they are small, dependency-free
//   modules exercised on every boot.
// =====================================================================

function makeSupportId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LND-${stamp}${rand}`;
}

type BoundaryState = { error: Error | null; supportId: string };

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null, supportId: '' };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, supportId: makeSupportId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The RAW error stays in the console for diagnosis — only the UI
    // copy is sanitised.
    // eslint-disable-next-line no-console
    console.error(
      `[lend] uncaught render error (${this.state.supportId})`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return <CrashScreen supportId={this.state.supportId} />;
    }
    return this.props.children;
  }
}

function CrashScreen({ supportId }: { supportId: string }) {
  // Safe to use hooks here: the boundary sits BELOW LanguageProvider,
  // so a crash in the routed tree leaves the i18n context intact.
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copySupportId = () => {
    navigator.clipboard
      ?.writeText(supportId)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen grid place-items-center px-6 py-10 bg-canvas">
      <div className="max-w-sm w-full rounded-xl3 bg-white ring-1 ring-canvas-200 p-6 shadow-soft text-center">
        <span className="mx-auto h-12 w-12 rounded-2xl bg-warn-50 ring-1 ring-warn-500/25 text-warn-600 grid place-items-center">
          <AlertIcon size={22} />
        </span>
        <h1 className="mt-4 editorial-title text-[20px] text-ink-900 leading-tight">
          {t('errors.boundary.title')}
        </h1>
        <p className="mt-2 text-[13px] text-ink-500 leading-relaxed">
          {t('errors.boundary.body')}
        </p>

        <div className="mt-4 rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0 text-start">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t('errors.boundary.supportIdLabel')}
            </div>
            <div className="text-[13px] font-semibold text-ink-900 num truncate" dir="ltr">
              {supportId}
            </div>
          </div>
          <button
            type="button"
            onClick={copySupportId}
            className="shrink-0 text-[12px] font-semibold text-lavender-700 underline underline-offset-4 decoration-canvas-300"
          >
            {copied ? t('errors.boundary.copiedCta') : t('errors.boundary.copyCta')}
          </button>
        </div>

        <div className="mt-5">
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => window.location.reload()}
          >
            {t('errors.boundary.reloadCta')}
          </Button>
        </div>
      </div>
    </div>
  );
}
