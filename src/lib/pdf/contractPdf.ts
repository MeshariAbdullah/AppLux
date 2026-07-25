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
// into one A4 file. Multi-page by construction: content blocks are
// measured and flowed into as many page divs as needed; every page
// repeats the brand header + public reference and carries a Latin-
// digit page number.
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
    pageWord: string;
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
const MARGIN = 56;
const HEADER_H = 88;
const FOOTER_H = 44;
const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H - MARGIN; // content budget

const FONT =
  "'IBM Plex Sans Arabic', 'Inter', 'Noto Naskh Arabic', system-ui, sans-serif";

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

function kvRow(label: string, value: string, ltrValue = false): HTMLElement {
  const row = el('div', {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '7px 0',
    borderBottom: '1px solid #efe9df',
    fontSize: '13px',
  });
  row.appendChild(el('div', { color: '#6b6459', flexShrink: '0' }, label));
  const v = el('div', { color: '#161b33', fontWeight: '600', textAlign: 'end' }, value);
  if (ltrValue) v.dir = 'ltr';
  row.appendChild(v);
  return row;
}

function sectionTitle(text: string): HTMLElement {
  return el(
    'div',
    {
      fontSize: '12px',
      fontWeight: '700',
      color: '#7a6df0',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      margin: '18px 0 6px',
    },
    text,
  );
}

/** Builds the paginated A4 page elements. Exposed separately so tests
 *  can assert the document CONTENT without rasterizing anything. */
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
  // Pagination measures scrollHeight, which is 0 for detached nodes —
  // the container must live in the document WHILE blocks are flowed.
  // Callers remove it when done.
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

    // Repeated header: brand + document title + public reference.
    const header = el('div', {
      height: `${HEADER_H}px`,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingBottom: '10px',
      borderBottom: '2px solid #161b33',
      boxSizing: 'border-box',
    });
    const brandWrap = el('div', {});
    brandWrap.appendChild(
      el('div', { fontSize: '20px', fontWeight: '800', color: '#161b33' }, L.brand),
    );
    brandWrap.appendChild(
      el('div', { fontSize: '12px', color: '#6b6459', marginTop: '2px' }, L.docTitle),
    );
    header.appendChild(brandWrap);
    const refWrap = el('div', { textAlign: 'end' });
    refWrap.appendChild(
      el('div', { fontSize: '10.5px', color: '#6b6459' }, L.reference),
    );
    const refVal = el(
      'div',
      { fontSize: '15px', fontWeight: '700', color: '#161b33' },
      input.reference,
    );
    refVal.dir = 'ltr';
    refWrap.appendChild(refVal);
    header.appendChild(refWrap);
    page.appendChild(header);

    content = el('div', {
      maxHeight: `${CONTENT_H}px`,
      overflow: 'hidden',
      paddingTop: '6px',
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
      justifyContent: 'space-between',
      borderTop: '1px solid #efe9df',
      fontSize: '10.5px',
      color: '#6b6459',
    });
    const refSmall = el('div', {}, input.reference);
    refSmall.dir = 'ltr';
    footer.appendChild(refSmall);
    const pageNum = el('div', {});
    pageNum.className = 'pdf-page-number';
    pageNum.dir = 'ltr';
    footer.appendChild(pageNum);
    page.appendChild(footer);

    container.appendChild(page);
    pages.push(page);
    return page;
  };

  newPage();

  // A block either fits in the current page's content area or moves
  // whole to a fresh page (blocks are small enough that a block always
  // fits an empty page).
  const push = (block: HTMLElement) => {
    content.appendChild(block);
    if (content.scrollHeight > CONTENT_H && content.childElementCount > 1) {
      content.removeChild(block);
      newPage();
      content.appendChild(block);
    }
  };

  // ---- record meta ----
  const meta = el('div', {});
  meta.appendChild(kvRow(L.status, V.statusLabel));
  meta.appendChild(kvRow(L.approvedAt, V.approvedAtLabel));
  push(meta);

  // ---- parties ----
  const parties = el('div', {});
  parties.appendChild(sectionTitle(L.partiesTitle));
  parties.appendChild(
    el('div', { fontSize: '12px', fontWeight: '700', color: '#161b33', margin: '6px 0 0' }, L.lessorTitle),
  );
  parties.appendChild(kvRow(L.businessName, V.businessName));
  parties.appendChild(kvRow(L.crNumber, V.crNumber, true));
  parties.appendChild(
    el('div', { fontSize: '12px', fontWeight: '700', color: '#161b33', margin: '10px 0 0' }, L.lesseeTitle),
  );
  parties.appendChild(kvRow(L.fullName, V.fullName));
  parties.appendChild(kvRow(L.nationalId, V.nationalId, true));
  push(parties);

  // ---- item ----
  const item = el('div', {});
  item.appendChild(sectionTitle(L.itemTitle));
  item.appendChild(kvRow(L.itemName, V.itemName));
  if (V.itemValue) item.appendChild(kvRow(L.itemValue, V.itemValue, true));
  push(item);

  // ---- period ----
  const period = el('div', {});
  period.appendChild(sectionTitle(L.periodTitle));
  period.appendChild(kvRow(L.startDate, V.startLabel, true));
  period.appendChild(kvRow(L.endDate, V.endLabel, true));
  period.appendChild(
    kvRow(L.duration, V.hoursLabel ? `${V.durationLabel} — ${V.hoursLabel}` : V.durationLabel),
  );
  push(period);

  // ---- financials ----
  const fin = el('div', {});
  fin.appendChild(sectionTitle(L.financialsTitle));
  fin.appendChild(kvRow(L.rentalFee, V.rentalFee, true));
  fin.appendChild(kvRow(L.tax, V.tax, true));
  fin.appendChild(kvRow(L.total, V.total, true));
  push(fin);

  // ---- clauses (canonical order, one block per clause) ----
  const clausesTitle = el('div', {});
  clausesTitle.appendChild(sectionTitle(L.clausesTitle));
  push(clausesTitle);
  input.clauses.forEach((c, i) => {
    const block = el('div', { padding: '6px 0' });
    block.appendChild(
      el(
        'div',
        { fontSize: '13px', fontWeight: '700', color: '#161b33' },
        `${i + 1}. ${c.title}`,
      ),
    );
    block.appendChild(
      el(
        'div',
        { fontSize: '12.5px', color: '#3d3a33', lineHeight: '1.7', marginTop: '2px' },
        c.body,
      ),
    );
    push(block);
  });

  // ---- financial obligations ----
  const obligations = el('div', {});
  obligations.appendChild(sectionTitle(L.obligationsTitle));
  input.obligations.forEach((o) => obligations.appendChild(kvRow(o.label, o.amount, true)));
  push(obligations);

  // ---- electronic-record statement ----
  const statement = el('div', {
    marginTop: '18px',
    padding: '12px 14px',
    background: '#faf7f2',
    border: '1px solid #efe9df',
    borderRadius: '8px',
    fontSize: '11.5px',
    color: '#6b6459',
    lineHeight: '1.7',
  });
  statement.textContent = input.labels.electronicRecord;
  push(statement);

  // Page numbers once the count is known (Latin digits).
  pages.forEach((p, i) => {
    const n = p.querySelector('.pdf-page-number');
    if (n) n.textContent = `${input.labels.pageWord} ${i + 1} / ${pages.length}`;
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

  // The webfont must be ready before rasterizing, or glyphs fall back.
  await document.fonts?.ready?.catch?.(() => undefined);

  // buildContractPdfPages attaches the offscreen container itself (it
  // needs live layout to paginate).
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
