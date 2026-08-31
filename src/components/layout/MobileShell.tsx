import type { ReactNode } from 'react';

type MobileShellProps = {
  children: ReactNode;
};

export function MobileShell({ children }: MobileShellProps) {
  // FIXED-height app shell (h-dvh, not min-h): the shell owns the
  // viewport, so its flex column clamps <Screen> (flex-1 min-h-0) into
  // the ONE scrolling region while headers and the bottom nav stay
  // put. min-h-dvh here previously let the column grow with content,
  // which pushed scrolling up to the document/body — the "scrolling
  // website" behavior on iOS.
  //
  // Tablet strategy (iPad / Android tablets / desktop web): the app
  // stays a single intentional content column — never stretched
  // edge-to-edge — but the column WIDENS on tablet viewports so it
  // reads as a tablet app, not a phone screen floating in the middle:
  //   < md          → full-bleed phone layout (unchanged)
  //   md (768–1023) → 600px centered card (iPad portrait fills most
  //                   of the width with comfortable margins)
  //   lg (1024+)    → 680px centered card (iPad landscape / desktop)
  // Sheets (Sheet / PaymentSimulationSheet) track the same widths so
  // overlays never look narrower than the app behind them.
  return (
    <div className="h-dvh w-full flex items-stretch justify-center overflow-hidden">
      <div
        className="relative w-full max-w-[440px] md:max-w-[600px] lg:max-w-[680px] h-full bg-canvas-50 flex flex-col overflow-hidden shadow-plush
                   md:self-center md:h-[calc(100dvh-4rem)] md:rounded-[2.25rem]
                   md:shadow-[0_50px_120px_-30px_rgba(20,14,6,0.30),0_12px_30px_-12px_rgba(20,14,6,0.12)]
                   md:hairline"
      >
        {children}
      </div>
    </div>
  );
}
