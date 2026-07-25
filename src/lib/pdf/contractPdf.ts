// =====================================================================
// Approved-contract PDF export — client-side, on demand.
//
// Architecture (audited): no PDF/export utility existed anywhere in
// the project. Generation is CLIENT-SIDE because every JS PDF text
// engine (jsPDF/pdfmake/pdf-lib) lacks Arabic glyph shaping — the
// only reliable Arabic/RTL renderer available is the browser itself.
// So the document is laid out as real DOM pages (A4 at 96dpi,
// 794×1123px) using the app's own IBM Plex Sans Arabic webfont, each
// page is rasterized with html2canvas, and jsPDF assembles the pages
// into one A4 file.
//
// Arabic-safety rules learned the hard way:
//   * NO letter-spacing / text-transform on Arabic text — spacing
//     detaches the connected glyphs and the rasterizer renders the
//     joins broken (the "corrupted purple headings" bug).
//   * Rasterize only after document.fonts.ready AND an explicit
//     fonts.load() of the families used here.
//
// Pagination: content flows as fine-grained blocks; every section
// heading is BOUND to its first row (no orphan headings), remaining
// rows flow individually so pages pack tightly instead of moving
// whole sections and leaving page bottoms blank.
//
// Data integrity: the caller passes PRE-FORMATTED strings assembled
// from the same authenticated, RLS-scoped state the contract-details
// screen renders (snapshot-first parties). This module never fetches,
// never touches demo data, and never receives internal UUIDs.
//
// Delivery: native platforms (Capacitor/WKWebView, where anchor
// downloads are unreliable) get the Web Share sheet with the PDF as a
// file when the platform supports file sharing; everything else gets
// a normal browser download. Nothing is uploaded or persisted.
// =====================================================================

import { Capacitor } from '@capacitor/core';

export type ContractPdfInput = {
  dir: 'rtl' | 'ltr';
  /** Public contract reference (LND-… or legacy CN-…). Never a UUID. */
  reference: string;
  fileName: string;
  labels: {
    brand: string;
    docTitle: string;
    reference: string;
    status: string;
    approvedAt: string;
    partiesTitle: string;
    lessorTitle: string;
    lesseeTitle: string;
    businessName: string;
    crNumber: string;
    fullName: string;
    nationalId: string;
    itemTitle: string;
    itemName: string;
    itemValue: string;
    periodTitle: string;
    startDate: string;
    endDate: string;
    duration: string;
    financialsTitle: string;
    rentalFee: string;
    tax: string;
    total: string;
    clausesTitle: string;
    obligationsTitle: string;
    electronicRecord: string;
    /** Page-number template, e.g. "صفحة {n} من {m}" / "Page {n} of {m}"
     *  — digits stay Latin in both languages. */
    pageOf: string;
  };
  values: {
    statusLabel: string;
    approvedAtLabel: string;
    businessName: string;
    crNumber: string;
    fullName: string;
    nationalId: string;
    itemName: string;
    itemValue: string | null;
    startLabel: string;
    endLabel: string;
    durationLabel: string;
    /** e.g. "من 4:00 م إلى 11:00 م" — omitted when the branch has no
     *  stored hours (never invented). */
    hoursLabel: string | null;
    rentalFee: string;
    tax: string;
    total: string;
  };
  clauses: { title: string; body: string }[];
  obligations: { label: string; amount: string }[];
};

const PAGE_W = 794; // A4 @ 96dpi
const PAGE_H = 1123;
const MARGIN = 48;
const HEADER_H = 78;
const FOOTER_H = 38;
const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H - MARGIN;

// IBM Plex Sans Arabic first (the app's font), with real Arabic-capable
// fallbacks so a slow/blocked webfont still shapes correctly.
const FONT =
  "'IBM Plex Sans Arabic', 'Noto Naskh Arabic', 'Geeza Pro', 'Segoe UI', system-ui, sans-serif";

// Print palette — high contrast, no tiny gray text.
const INK = '#14192e';
const BODY = '#2c2a25';
const MUTED = '#57534a';
const ACCENT = '#4c40c9';
const HAIRLINE = '#e6dfd2';

function el(
  tag: string,
  style: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function kvRow(
  label: string,
  value: string,
  opts: { ltrValue?: boolean; emphasis?: boolean } = {},
): HTMLElement {
  const row = el('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '18px',
    padding: opts.emphasis ? '10px 0' : '8px 0',
    borderBottom: `1px solid ${HAIRLINE}`,
    borderTop: opts.emphasis ? `2px solid ${INK}` : '',
    fontSize: opts.emphasis ? '15px' : '13.5px',
    lineHeight: '1.7',
  });
  row.appendChild(
    el(
      'div',
      {
        color: opts.emphasis ? INK : MUTED,
        flexShrink: '0',
        fontWeight: opts.emphasis ? '800' : '400',
      },
      label,
    ),
  );
  const v = el(
    'div',
    {
      color: INK,
      fontWeight: opts.emphasis ? '800' : '600',
      textAlign: 'end',
    },
    value,
  );
  if (opts.ltrValue) v.dir = 'ltr';
  row.appendChild(v);
  return row;
}

/** Section heading — NO letter-spacing / uppercase: both break Arabic
 *  glyph joining under rasterization. */
function sectionTitle(text: string): HTMLElement {
  return el(
    'div',
    {
      fontSize: '15px',
      fontWeight: '800',
      color: ACCENT,
      margin: '16px 0 2px',
      lineHeight: '1.6',
      borderBottom: `2px solid ${ACCENT}22`,
      paddingBottom: '4px',
    },
    text,
  );
}

function subTitle(text: string): HTMLElement {
  return el(
    'div',
    { fontSize: '13px', fontWeight: '800', color: INK, margin: '10px 0 0', lineHeight: '1.7' },
    text,
  );
}

/** Builds the paginated A4 page elements. Attaches the (offscreen)
 *  container to the document — pagination needs live layout — and the
 *  caller removes it. Exposed separately so tests can assert content
 *  without rasterizing. */
export function buildContractPdfPages(input: ContractPdfInput): {
  container: HTMLElement;
  pages: HTMLElement[];
} {
  const { labels: L, values: V } = input;

  const container = el('div', {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    zIndex: '-1',
  });
  container.dir = input.dir;
  document.body.appendChild(container);

  const pages: HTMLElement[] = [];
  let content: HTMLElement;

  const newPage = () => {
    const page = el('div', {
      width: `${PAGE_W}px`,
      height: `${PAGE_H}px`,
      background: '#ffffff',
      fontFamily: FONT,
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
      padding: `0 ${MARGIN}px`,
    });
    page.className = 'pdf-page';
    page.dir = input.dir;

    // Header — brand + document title on the start side, the public
    // reference alone on the end side (footer carries only the page
    // number: no metadata repeated twice).
    const header = el('div', {
      height: `${HEADER_H}px`,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingBottom: '12px',
      borderBottom: `2.5px solid ${INK}`,
      boxSizing: 'border-box',
    });
    const brandWrap = el('div', { lineHeight: '1.35' });
    brandWrap.appendChild(
      el('div', { fontSize: '22px', fontWeight: '800', color: INK }, L.brand),
    );
    brandWrap.appendChild(
      el('div', { fontSize: '13px', color: MUTED, marginTop: '2px' }, L.docTitle),
    );
    header.appendChild(brandWrap);
    const refWrap = el('div', { textAlign: 'end', lineHeight: '1.4' });
    refWrap.appendChild(el('div', { fontSize: '11px', color: MUTED }, L.reference));
    const refVal = el(
      'div',
      { fontSize: '16px', fontWeight: '800', color: INK },
      input.reference,
    );
    refVal.dir = 'ltr';
    refWrap.appendChild(refVal);
    header.appendChild(refWrap);
    page.appendChild(header);

    content = el('div', {
      maxHeight: `${CONTENT_H}px`,
      overflow: 'hidden',
      paddingTop: '4px',
      boxSizing: 'border-box',
    });
    content.className = 'pdf-content';
    page.appendChild(content);

    const footer = el('div', {
      position: 'absolute',
      bottom: '0',
      left: `${MARGIN}px`,
      right: `${MARGIN}px`,
      height: `${FOOTER_H}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      borderTop: `1px solid ${HAIRLINE}`,
      fontSize: '11px',
      color: MUTED,
    });
    const pageNum = el('div', { lineHeight: '1' });
    pageNum.className = 'pdf-page-number';
    footer.appendChild(pageNum);
    page.appendChild(footer);

    container.appendChild(page);
    pages.push(page);
    return page;
  };

  newPage();

  // A block either fits the current page or moves whole to a fresh one.
  const push = (block: HTMLElement) => {
    content.appendChild(block);
    if (content.scrollHeight > CONTENT_H && content.childElementCount > 1) {
      content.removeChild(block);
      newPage();
      content.appendChild(block);
    }
  };

  // Section = heading BOUND to its first row (never an orphan heading),
  // then the remaining rows flow one by one for tight packing.
  const pushSection = (title: string, rows: HTMLElement[]) => {
    if (rows.length === 0) return;
    const head = el('div', {});
    head.appendChild(sectionTitle(title));
    head.appendChild(rows[0]);
    push(head);
    for (let i = 1; i < rows.length; i++) push(rows[i]);
  };

  // ---- record meta ----
  const meta = el('div', {});
  meta.appendChild(kvRow(L.status, V.statusLabel));
  meta.appendChild(kvRow(L.approvedAt, V.approvedAtLabel, { ltrValue: false }));
  push(meta);

  // ---- parties ----
  pushSection(L.partiesTitle, [
    (() => {
      const w = el('div', {});
      w.appendChild(subTitle(L.lessorTitle));
      w.appendChild(kvRow(L.businessName, V.businessName));
      return w;
    })(),
    kvRow(L.crNumber, V.crNumber, { ltrValue: true }),
    (() => {
      const w = el('div', {});
      w.appendChild(subTitle(L.lesseeTitle));
      w.appendChild(kvRow(L.fullName, V.fullName));
      return w;
    })(),
    kvRow(L.nationalId, V.nationalId, { ltrValue: true }),
  ]);

  // ---- item ----
  pushSection(L.itemTitle, [
    kvRow(L.itemName, V.itemName),
    ...(V.itemValue ? [kvRow(L.itemValue, V.itemValue, { ltrValue: true })] : []),
  ]);

  // ---- period ----
  pushSection(L.periodTitle, [
    kvRow(L.startDate, V.startLabel),
    kvRow(L.endDate, V.endLabel),
    kvRow(
      L.duration,
      V.hoursLabel ? `${V.durationLabel} — ${V.hoursLabel}` : V.durationLabel,
    ),
  ]);

  // ---- financials (total emphasized) ----
  pushSection(L.financialsTitle, [
    kvRow(L.rentalFee, V.rentalFee, { ltrValue: true }),
    kvRow(L.tax, V.tax, { ltrValue: true }),
    kvRow(L.total, V.total, { ltrValue: true, emphasis: true }),
  ]);

  // ---- clauses (canonical order; heading bound to clause 1) ----
  const clauseBlock = (c: { title: string; body: string }, i: number) => {
    const block = el('div', { padding: '7px 0' });
    block.appendChild(
      el(
        'div',
        { fontSize: '14px', fontWeight: '800', color: INK, lineHeight: '1.7' },
        `${i + 1}. ${c.title}`,
      ),
    );
    block.appendChild(
      el(
        'div',
        { fontSize: '13px', color: BODY, lineHeight: '1.75', marginTop: '2px' },
        c.body,
      ),
    );
    return block;
  };
  pushSection(
    L.clausesTitle,
    input.clauses.map((c, i) => clauseBlock(c, i)),
  );

  // ---- financial obligations ----
  pushSection(
    L.obligationsTitle,
    input.obligations.map((o) => kvRow(o.label, o.amount, { ltrValue: true })),
  );

  // ---- electronic-record statement ----
  const statement = el('div', {
    marginTop: '20px',
    padding: '14px 16px',
    background: '#faf7f2',
    border: `1px solid ${HAIRLINE}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: MUTED,
    lineHeight: '1.8',
  });
  statement.textContent = input.labels.electronicRecord;
  push(statement);

  // Page numbers once the count is known (Latin digits).
  pages.forEach((p, i) => {
    const n = p.querySelector('.pdf-page-number');
    if (n)
      n.textContent = input.labels.pageOf
        .replace('{n}', String(i + 1))
        .replace('{m}', String(pages.length));
  });

  return { container, pages };
}

/** Renders, assembles, and delivers the PDF. Returns the page count. */
export async function exportContractPdf(
  input: ContractPdfInput,
): Promise<{ pages: number }> {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;

  // Fonts must be fully ready before layout/rasterization, or Arabic
  // measures with a fallback and paints garbled. Explicitly request
  // the weights this document uses, then await the ready barrier.
  try {
    await Promise.all([
      document.fonts?.load?.("400 14px 'IBM Plex Sans Arabic'"),
      document.fonts?.load?.("600 14px 'IBM Plex Sans Arabic'"),
      document.fonts?.load?.("800 16px 'IBM Plex Sans Arabic'"),
    ]);
  } catch {
    // Fallback stack still shapes Arabic correctly.
  }
  await document.fonts?.ready?.catch?.(() => undefined);

  // buildContractPdfPages attaches the offscreen container itself (it
  // needs live layout to paginate — with the final, loaded fonts).
  const { container, pages } = buildContractPdfPages(input);
  try {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }

    const blob = doc.output('blob');
    const file = new File([blob], input.fileName, { type: 'application/pdf' });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (Capacitor.isNativePlatform() && nav.canShare?.({ files: [file] })) {
      // WKWebView anchor downloads are unreliable — hand the file to
      // the native share sheet (user cancel is not an error).
      try {
        await nav.share!({ files: [file], title: input.fileName });
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') throw err;
      }
    } else {
      doc.save(input.fileName);
    }
    return { pages: pages.length };
  } finally {
    container.remove();
  }
}
