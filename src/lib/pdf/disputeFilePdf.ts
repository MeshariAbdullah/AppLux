// =====================================================================
// "ملف النزاع الموثق" / Documented Dispute File — the SINGLE shared
// document service used by the customer, merchant, and admin surfaces.
//
// Availability: ONLY for dispute_outcome = 'unresolved' (the caller
// gates the CTA; this module also refuses any other outcome). Both
// parties receive the SAME substantive record: every section is built
// exclusively from persisted canonical data (case row, contract party
// snapshots, proposals + per-party responses, dispute_events, evidence
// rows, receipt photos) fetched through the RLS-scoped query layer.
// After the unresolved terminal state all of those records are
// effectively immutable (RPC phase guards + insert-only tables +
// phase-scoped evidence policies + snapshot columns), so client-side
// deterministic generation is safe — no server snapshot needed.
//
// Neutrality is a hard rule: the document never states that either
// party is correct/liable, never references Nafith / promissory notes
// / courts / enforcement, and carries an explicit neutral-purpose
// statement plus the "no ruling" final-result section.
//
// Rendering: same architecture as contractPdf.ts (the only reliable
// Arabic shaper is the browser): real DOM A4 pages in the app's own
// IBM Plex Sans Arabic webfont → html2canvas raster → jsPDF assembly.
// No external fonts are shipped. Evidence images are fetched from
// short-lived signed URLs, downscaled to data URLs before layout;
// an unloadable image becomes a factual "media unavailable" row and
// never fails the document. Storage paths are never printed.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import {
  fetchContractById,
  fetchDisputeCase,
  fetchInvoiceById,
  fetchMerchant,
  fetchProfile,
  getReceiptPhotoUrl,
  listContractReceiptPhotos,
  listDisputeEvents,
  listDisputeEvidence,
  listDisputeProposals,
  listInvoiceItems,
} from '@/lib/supabase';
import { buildContractFromTemplate } from '@/lib/contractTemplate';

type TFn = (k: string, v?: Record<string, string | number>) => string;

export type DisputeFileContext = {
  caseId: string;
  dir: 'rtl' | 'ltr';
  locale: 'ar' | 'en';
  t: TFn;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
};

// ---------------------------------------------------------------------
// layout primitives (shared architecture with contractPdf.ts)
// ---------------------------------------------------------------------

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 48;
const HEADER_H = 78;
const FOOTER_H = 38;
const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H - MARGIN;
const FONT =
  "'IBM Plex Sans Arabic', 'Noto Naskh Arabic', 'Geeza Pro', 'Segoe UI', system-ui, sans-serif";
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
  opts: { ltrValue?: boolean } = {},
): HTMLElement {
  const row = el('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '18px',
    padding: '7px 0',
    borderBottom: `1px solid ${HAIRLINE}`,
    fontSize: '13px',
    lineHeight: '1.7',
  });
  row.appendChild(el('div', { color: MUTED, flexShrink: '0' }, label));
  const v = el('div', { color: INK, fontWeight: '600', textAlign: 'end' }, value);
  if (opts.ltrValue) v.dir = 'ltr';
  row.appendChild(v);
  return row;
}

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

function paragraph(text: string): HTMLElement {
  return el(
    'div',
    { fontSize: '13px', color: BODY, lineHeight: '1.8', padding: '6px 0' },
    text,
  );
}

function noticeBox(text: string): HTMLElement {
  return el(
    'div',
    {
      margin: '12px 0',
      padding: '14px 16px',
      background: '#faf7f2',
      border: `1px solid ${HAIRLINE}`,
      borderRadius: '8px',
      fontSize: '12.5px',
      color: MUTED,
      lineHeight: '1.85',
    },
    text,
  );
}

// ---------------------------------------------------------------------
// evidence images: signed URL → downscaled data URL (soft-fail)
// ---------------------------------------------------------------------

async function toDataUrl(url: string, maxDim = 520): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

/** 2-up image rows, aspect preserved (no distortion — object-fit is
 *  unreliable under html2canvas, so images keep natural ratio inside a
 *  fixed-width cell). */
function imageGrid(dataUrls: string[], unavailableCount: number, unavailableLabel: string): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  for (let i = 0; i < dataUrls.length; i += 2) {
    const row = el('div', { display: 'flex', gap: '14px', padding: '8px 0' });
    for (const u of dataUrls.slice(i, i + 2)) {
      const cell = el('div', {
        width: '335px',
        border: `1px solid ${HAIRLINE}`,
        borderRadius: '6px',
        overflow: 'hidden',
        background: '#fff',
      });
      const img = document.createElement('img');
      img.src = u;
      Object.assign(img.style, { width: '100%', display: 'block' });
      cell.appendChild(img);
      row.appendChild(cell);
    }
    blocks.push(row);
  }
  if (unavailableCount > 0) {
    blocks.push(
      el(
        'div',
        { fontSize: '12px', color: MUTED, padding: '4px 0', lineHeight: '1.7' },
        `${unavailableLabel} (${unavailableCount})`,
      ),
    );
  }
  return blocks;
}

// ---------------------------------------------------------------------
// the document
// ---------------------------------------------------------------------

export async function exportDisputeFilePdf(ctx: DisputeFileContext): Promise<{ pages: number }> {
  const { caseId, dir, locale, t, formatCurrency, formatDate } = ctx;
  const F = (k: string, v?: Record<string, string | number>) => t(`disputeFile.${k}`, v);

  // ---- canonical bundle (RLS-scoped; identical substance per role) ----
  const kase = await fetchDisputeCase(caseId);
  if (!kase) throw new Error('dispute case not found');
  if (kase.dispute_outcome !== 'unresolved') {
    // Hard gate: the documented dispute file exists only for the
    // failed-settlement terminal state.
    throw new Error('dispute file is only available for unresolved outcomes');
  }
  const [contract, merchant, customer, proposals, events, evidence] = await Promise.all([
    fetchContractById(kase.contract_id).catch(() => null),
    fetchMerchant(kase.merchant_id).catch(() => null),
    fetchProfile(kase.customer_user_id).catch(() => null),
    listDisputeProposals(kase.id).catch(() => []),
    listDisputeEvents(kase.id).catch(() => []),
    listDisputeEvidence(kase.id).catch(() => []),
  ]);
  const invoice = contract
    ? await fetchInvoiceById(contract.invoice_id).catch(() => null)
    : null;
  const items = contract
    ? await listInvoiceItems(contract.invoice_id).catch(() => [])
    : [];
  const receiptRows = contract
    ? await listContractReceiptPhotos(contract.id).catch(() => [])
    : [];

  // Party snapshots first (contract-time identity), mutable profile
  // data only as a legacy fallback.
  const merchantName =
    contract?.lessor_legal_name ??
    merchant?.company_name ??
    merchant?.display_name?.[locale] ??
    '—';
  const merchantCr = contract?.lessor_cr_number ?? merchant?.commercial_reg_number ?? '—';
  const customerName = contract?.lessee_legal_name ?? customer?.full_name ?? '—';
  const customerNationalId = contract?.lessee_national_id ?? '—';

  // Contract agreement content — same canonical generator the customer
  // approved at review time.
  const template =
    invoice && items.length
      ? buildContractFromTemplate({
          invoice,
          items,
          merchant,
          pickupDate: contract!.start_date,
          returnDate: contract!.end_date,
          durationDays: Math.max(...items.map((it) => it.rental_days || 0)) || 30,
          branchHours: null,
        })
      : null;

  // ---- evidence images (downscaled; soft-fail) ----
  const receiptUrls = (
    await Promise.all(receiptRows.map((p) => getReceiptPhotoUrl(p.storage_path)))
  ).filter((u): u is string => Boolean(u));
  const receiptImgs = (await Promise.all(receiptUrls.map((u) => toDataUrl(u)))).filter(
    (u): u is string => Boolean(u),
  );
  const merchantEvidence = evidence.filter(
    (e) => e.row.uploaded_by_user_id !== kase.customer_user_id,
  );
  const customerEvidence = evidence.filter(
    (e) => e.row.uploaded_by_user_id === kase.customer_user_id,
  );
  const merchImgs = (
    await Promise.all(merchantEvidence.map((e) => (e.url ? toDataUrl(e.url) : null)))
  ).filter((u): u is string => Boolean(u));
  const custImgs = (
    await Promise.all(customerEvidence.map((e) => (e.url ? toDataUrl(e.url) : null)))
  ).filter((u): u is string => Boolean(u));

  // ---- fonts, then DOM pages ----
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;
  try {
    await Promise.all([
      document.fonts?.load?.("400 14px 'IBM Plex Sans Arabic'"),
      document.fonts?.load?.("600 14px 'IBM Plex Sans Arabic'"),
      document.fonts?.load?.("800 16px 'IBM Plex Sans Arabic'"),
    ]);
  } catch {
    /* fallback stack still shapes Arabic */
  }
  await document.fonts?.ready?.catch?.(() => undefined);

  const container = el('div', { position: 'fixed', left: '-12000px', top: '0', zIndex: '-1' });
  container.dir = dir;
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
    page.dir = dir;
    const header = el('div', {
      height: `${HEADER_H}px`,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingBottom: '12px',
      borderBottom: `2.5px solid ${INK}`,
      boxSizing: 'border-box',
    });
    const brand = el('div', { lineHeight: '1.35' });
    brand.appendChild(el('div', { fontSize: '22px', fontWeight: '800', color: INK }, 'Lend'));
    brand.appendChild(el('div', { fontSize: '13px', color: MUTED, marginTop: '2px' }, F('title')));
    header.appendChild(brand);
    const refWrap = el('div', { textAlign: 'end', lineHeight: '1.4' });
    refWrap.appendChild(el('div', { fontSize: '11px', color: MUTED }, F('caseRef')));
    const refVal = el('div', { fontSize: '16px', fontWeight: '800', color: INK }, kase.case_number);
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
    const num = el('div', { lineHeight: '1' });
    num.className = 'pdf-page-number';
    footer.appendChild(num);
    page.appendChild(footer);
    container.appendChild(page);
    pages.push(page);
  };
  newPage();
  const push = (block: HTMLElement) => {
    content.appendChild(block);
    if (content.scrollHeight > CONTENT_H && content.childElementCount > 1) {
      content.removeChild(block);
      newPage();
      content.appendChild(block);
    }
  };
  const pushSection = (title: string, blocks: HTMLElement[]) => {
    if (blocks.length === 0) return;
    const head = el('div', {});
    head.appendChild(sectionTitle(title));
    head.appendChild(blocks[0]);
    push(head);
    for (let i = 1; i < blocks.length; i++) push(blocks[i]);
  };

  const generatedAt = new Date().toISOString();
  const partyLabel = (p: 'merchant' | 'customer' | 'lend') => F(`party.${p}`);
  const sevKey = kase.severity === 'non_return' ? 'non-return' : kase.severity;

  try {
    // 1) cover meta
    const cover = el('div', {});
    cover.appendChild(kvRow(F('caseRef'), kase.case_number, { ltrValue: true }));
    if (contract) cover.appendChild(kvRow(F('contractRef'), contract.contract_number, { ltrValue: true }));
    cover.appendChild(kvRow(F('generatedAt'), formatDate(generatedAt)));
    push(cover);

    // 2) neutral purpose statement
    push(noticeBox(F('purpose')));

    // 3) rental contract summary
    if (contract) {
      pushSection(F('contractSection'), [
        kvRow(F('contractRef'), contract.contract_number, { ltrValue: true }),
        kvRow(F('contractDate'), formatDate(contract.created_at)),
        kvRow(
          F('period'),
          `${formatDate(contract.start_date)} — ${formatDate(contract.end_date)}`,
        ),
        ...(items[0] ? [kvRow(F('item'), items[0].item_name)] : []),
        kvRow(F('itemValue'), formatCurrency(Number(contract.original_item_value)), { ltrValue: true }),
        kvRow(F('rentalTotal'), formatCurrency(Number(contract.total_amount)), { ltrValue: true }),
      ]);
    }

    // 4) parties at contract time (snapshots)
    pushSection(F('partiesSection'), [
      kvRow(F('lessor'), merchantName),
      kvRow(F('lessorCr'), merchantCr, { ltrValue: true }),
      kvRow(F('lessee'), customerName),
      kvRow(F('lesseeId'), customerNationalId, { ltrValue: true }),
    ]);

    // 5) documented rental agreement content (canonical template)
    if (template) {
      pushSection(
        F('agreementSection'),
        [
          paragraph(F('agreementNote')),
          ...template.clauses.map((c, i) => {
            const b = el('div', { padding: '6px 0' });
            b.appendChild(
              el('div', { fontSize: '13.5px', fontWeight: '800', color: INK, lineHeight: '1.7' }, `${i + 1}. ${c.title[locale]}`),
            );
            b.appendChild(el('div', { fontSize: '12.5px', color: BODY, lineHeight: '1.75' }, c.body[locale]));
            return b;
          }),
        ],
      );
    }

    // 6) customer receipt evidence
    pushSection(F('receiptSection'), [
      paragraph(F('receiptNote')),
      ...(receiptImgs.length || receiptUrls.length - receiptImgs.length > 0
        ? imageGrid(receiptImgs, receiptUrls.length - receiptImgs.length, F('mediaUnavailable'))
        : [paragraph(F('noMedia'))]),
    ]);

    // 7) merchant claim
    pushSection(F('claimSection'), [
      kvRow(F('claimType'), t(`merchant.damages.severity.${sevKey}`)),
      kvRow(F('claimAmount'), formatCurrency(Number(kase.claim_amount)), { ltrValue: true }),
      kvRow(F('claimAt'), formatDate(kase.raised_at)),
      ...(kase.description ? [paragraph(kase.description)] : []),
      ...(merchImgs.length || merchantEvidence.length - merchImgs.length > 0
        ? imageGrid(merchImgs, merchantEvidence.length - merchImgs.length, F('mediaUnavailable'))
        : [paragraph(F('noMedia'))]),
    ]);

    // 8) customer response
    pushSection(F('responseSection'), [
      kvRow(
        F('responseKind'),
        kase.customer_objection_reason ? F('responseObjected') : F('responseNone'),
      ),
      ...(kase.customer_response_at
        ? [kvRow(F('responseAt'), formatDate(kase.customer_response_at))]
        : []),
      ...(kase.customer_objection_reason ? [paragraph(kase.customer_objection_reason)] : []),
      ...(custImgs.length || customerEvidence.length - custImgs.length > 0
        ? imageGrid(custImgs, customerEvidence.length - custImgs.length, F('mediaUnavailable'))
        : []),
    ]);

    // 9) direct settlement history + 10) Lend mediation
    const proposalBlock = (p: (typeof proposals)[number]) => {
      const b = el('div', { padding: '7px 0', borderBottom: `1px solid ${HAIRLINE}` });
      const head = el('div', { display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '13px' });
      head.appendChild(
        el(
          'div',
          { fontWeight: '800', color: INK },
          p.kind === 'lend'
            ? F('lendProposal')
            : `${F('round', { n: p.round ?? 0 })} — ${partyLabel(p.proposed_by_party)}`,
        ),
      );
      const amt = el('div', { fontWeight: '800', color: INK }, formatCurrency(Number(p.amount)));
      amt.dir = 'ltr';
      head.appendChild(amt);
      b.appendChild(head);
      if (p.note) b.appendChild(el('div', { fontSize: '12.5px', color: BODY, lineHeight: '1.7' }, p.note));
      b.appendChild(
        el('div', { fontSize: '11.5px', color: MUTED, marginTop: '2px' }, formatDate(p.created_at)),
      );
      for (const r of p.dispute_proposal_responses) {
        b.appendChild(
          el(
            'div',
            { fontSize: '12.5px', color: BODY, lineHeight: '1.7' },
            `${partyLabel(r.party)}: ${r.accepted ? F('respAccepted') : F('respRejected')} · ${formatDate(r.created_at)}`,
          ),
        );
      }
      return b;
    };
    const direct = proposals.filter((p) => p.kind === 'direct');
    if (direct.length) pushSection(F('directSection'), direct.map(proposalBlock));
    const lend = proposals.filter((p) => p.kind === 'lend');
    if (lend.length) pushSection(F('lendSection'), lend.map(proposalBlock));

    // 11) documented timeline (persisted events, chronological)
    pushSection(
      F('timelineSection'),
      events.map((e) =>
        kvRow(t(`merchant.disputes.events.${e.event_type}`), formatDate(e.created_at)),
      ),
    );

    // 12) final result — factual, no liability
    pushSection(F('resultSection'), [paragraph(F('resultBody'))]);
    push(noticeBox(F('neutrality')));

    // 13) reference block
    const ref = el('div', { marginTop: '10px' });
    ref.appendChild(kvRow(F('caseRef'), kase.case_number, { ltrValue: true }));
    if (contract) ref.appendChild(kvRow(F('contractRef'), contract.contract_number, { ltrValue: true }));
    ref.appendChild(kvRow(F('generatedAt'), formatDate(generatedAt)));
    push(ref);

    // page numbers
    pages.forEach((p, i) => {
      const n = p.querySelector('.pdf-page-number');
      if (n)
        n.textContent = F('pageOf')
          .replace('{n}', String(i + 1))
          .replace('{m}', String(pages.length));
    });

    // ---- rasterize + deliver ----
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
    const fileName = `lend-dispute-${kase.case_number}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (Capacitor.isNativePlatform() && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share!({ files: [file], title: fileName });
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') throw err;
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    return { pages: pages.length };
  } finally {
    container.remove();
  }
}
