import SwiftUI

// =====================================================================
// LendMark — the approved Lend logo mark as native SwiftUI.
// =====================================================================
// GEOMETRY SOURCE OF TRUTH: lend-logo-mark-primary.svg /
// lend-logo-mark-on-dark.svg from the approved brand guidelines PDF
// (the in-app React `LendLogo` renders the identical geometry). The
// mark is drawn as Shapes — vector, crisp at any size, tintable.
//
// 100×100 design box (scale by size / 100):
//   top half:    (15,50) → cubic to (50,15) ctrl (15,26.667)(26.667,15)
//                        → cubic to (85,50) ctrl (73.333,15)(85,26.667)
//   bottom half: (85,50) → cubic to (50,85) ctrl (85,73.333)(73.333,85)
//                        → cubic to (15,50) ctrl (26.667,85)(15,73.333)
//   stroke 12.5, round caps, no fill; center dot r 10 at (50,50).
//
// BRAND RULES (enforced):
//   * proportions locked — a single `size` scales everything
//   * minimum size 24pt (clamped, asserted in debug builds)
//   * clear space = half the dot's diameter = 0.1 × size
//     (`.brandClearSpace()` pads exactly that)
//
// The main product UI is the Capacitor WebView (React `LendLogo`);
// use this view for any NATIVE surface — widgets, share sheets,
// native loading states, App Clip, etc.
// =====================================================================

enum LendMarkVariant {
    case primary   // light surfaces: navy top, green bottom, navy dot
    case onDark    // dark navy surfaces: white top + dot, green bottom
    case mono      // single-color: everything Deep Navy

    var top: Color {
        switch self {
        case .primary, .mono: return LendBrand.navy
        case .onDark: return .white
        }
    }

    var bottom: Color {
        switch self {
        case .mono: return LendBrand.navy
        case .primary, .onDark: return LendBrand.green
        }
    }

    var dot: Color {
        switch self {
        case .primary, .mono: return LendBrand.navy
        case .onDark: return .white
        }
    }
}

enum LendBrand {
    static let navy = Color(red: 0x1B / 255, green: 0x29 / 255, blue: 0x51 / 255)   // #1B2951
    static let green = Color(red: 0x12 / 255, green: 0xA6 / 255, blue: 0x7E / 255)  // #12A67E

    /// Brand minimum rendered size for the mark, in points.
    static let markMinimumSize: CGFloat = 24
    /// Required clear space around the mark: half the dot's diameter.
    static let markClearSpaceRatio: CGFloat = 0.1
}

/// Top half of the ring, in the 100×100 design box.
struct LendMarkTopHalf: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 100
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
        }
        var path = Path()
        path.move(to: p(15, 50))
        path.addCurve(to: p(50, 15), control1: p(15, 26.667), control2: p(26.667, 15))
        path.addCurve(to: p(85, 50), control1: p(73.333, 15), control2: p(85, 26.667))
        return path
    }
}

/// Bottom half of the ring, in the 100×100 design box.
struct LendMarkBottomHalf: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 100
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
        }
        var path = Path()
        path.move(to: p(85, 50))
        path.addCurve(to: p(50, 85), control1: p(85, 73.333), control2: p(73.333, 85))
        path.addCurve(to: p(15, 50), control1: p(26.667, 85), control2: p(15, 73.333))
        return path
    }
}

/// The approved Lend mark. Always square; never distort it.
struct LendMark: View {
    var variant: LendMarkVariant = .primary
    var size: CGFloat = 40

    private var renderedSize: CGFloat {
        assert(size >= LendBrand.markMinimumSize,
               "LendMark below the 24pt brand minimum")
        return max(size, LendBrand.markMinimumSize)
    }

    var body: some View {
        let s = renderedSize
        let strokeStyle = StrokeStyle(lineWidth: 12.5 * s / 100, lineCap: .round)
        ZStack {
            LendMarkTopHalf()
                .stroke(variant.top, style: strokeStyle)
            LendMarkBottomHalf()
                .stroke(variant.bottom, style: strokeStyle)
            Circle()
                .fill(variant.dot)
                .frame(width: 20 * s / 100, height: 20 * s / 100)
        }
        .frame(width: s, height: s)
        .accessibilityHidden(true)
    }
}

extension LendMark {
    /// Pads the mark with the brand-required clear space
    /// (half the dot's diameter on every side).
    func brandClearSpace() -> some View {
        padding(max(size, LendBrand.markMinimumSize) * LendBrand.markClearSpaceRatio)
    }
}

/// Mark + "LEND" wordmark lockup: Inter Bold (falls back to the
/// system bold face if Inter is not bundled), letter-spacing
/// 0.35 × font size, per the brand guidelines.
struct LendLockup: View {
    var variant: LendMarkVariant = .primary
    var markSize: CGFloat = 56

    private var wordColor: Color {
        variant == .onDark ? .white : LendBrand.navy
    }

    var body: some View {
        let fontSize = markSize * 0.22
        VStack(spacing: markSize * LendBrand.markClearSpaceRatio) {
            LendMark(variant: variant, size: markSize)
            Text("LEND")
                .font(.custom("Inter-Bold", size: fontSize, relativeTo: .title3).weight(.bold))
                .kerning(0.35 * fontSize)
                // kerning trails the last glyph; pull the lockup back
                // to optical centre.
                .padding(.leading, 0.35 * fontSize)
                .foregroundColor(wordColor)
        }
        .accessibilityLabel("Lend")
    }
}

#if DEBUG
struct LendMark_Previews: PreviewProvider {
    static var previews: some View {
        HStack(spacing: 24) {
            LendMark(variant: .primary, size: 64)
            LendMark(variant: .mono, size: 64)
            LendLockup(variant: .primary, markSize: 64)
        }
        .padding()
        .previewDisplayName("Light")

        HStack(spacing: 24) {
            LendMark(variant: .onDark, size: 64)
            LendLockup(variant: .onDark, markSize: 64)
        }
        .padding()
        .background(LendBrand.navy)
        .previewDisplayName("On dark")
    }
}
#endif
