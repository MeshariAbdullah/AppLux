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
  // stays ONE intentional centered canvas — never stretched
  // edge-to-edge — that widens with the viewport so it reads as a
  // tablet/desktop app, not a phone screen floating in the middle:
  //   < md          → full-bleed phone layout (unchanged)
  //   md (768–1023) → 720px canvas (iPad portrait fills the width
  //                   with comfortable margins)
  //   lg (1024–1279)→ 960px canvas (iPad landscape)
  //   xl (1280+)    → 1080px canvas (desktop / wide desktop)
  // INSIDE the canvas, page content is constrained again by
  // PageContainer / the padded-<Screen> column (640px reading column,
  // 1024px for two-column DetailLayout pages), so nothing renders as
  // an oversized phone card. Overlays (Sheet / PaymentSimulationSheet)
  // stay bottom sheets on phones and become centered dialogs at md+.
  return (
    <div className="h-dvh w-full flex items-stretch justify-center overflow-hidden">
      <div
        className="relative w-full max-w-[440px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1080px] h-full bg-canvas-50 flex flex-col overflow-hidden shadow-plush
                   md:self-center md:h-[calc(100dvh-4rem)] md:rounded-[2.25rem]
                   md:shadow-[0_50px_120px_-30px_rgba(20,14,6,0.30),0_12px_30px_-12px_rgba(20,14,6,0.12)]
                   md:hairline"
      >
        {children}
      </div>
    </div>
  );
}
