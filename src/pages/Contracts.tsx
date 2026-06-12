import { useEffect, useMemo, useRef, useState } from 'react';
import { Header, Screen } from '@/components/layout';
import { Card, EmptyState, SectionHeader } from '@/components/ui';
import { CameraIcon, CheckIcon, DocIcon, WalletIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptNote,
  listCustomerContracts,
  listCustomerNotes,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, PromissoryNote } from '@/lib/data';
import { ContractRow, NoteRow } from '@/components/rental/Rows';
import { cn } from '@/lib/cn';

// =====================================================================
// Contracts tab (SCRUM-41 Bug 6).
//
// Two sections, nothing else:
//   - "New contracts" — active customer contracts.
//   - "Promissory notes" — the customer's promissory notes.
//
// Per the SCRUM-41 brief, the old "New contract" CTA in the header
// and in the empty state is removed entirely. A customer doesn't
// create contracts from this surface — the merchant initiates them.
//
// Plus a required customer action: BEFORE receiving the item from the
// merchant, the customer must capture a handover photo. This is shown
// inline on each active contract row as a small banner. State is
// kept client-side via localStorage (key: lend.handover.<contractId>)
// because the rental_contracts table has no handover column yet.
// When backend handover state is introduced later, this client flag
// becomes the migration source.
// =====================================================================

export default function Contracts() {
  const t = useT();
  const { contracts: demoContracts, notes: demoNotes } = useStore();
  const { configured, session } = useSupabaseAuth();

  const [liveContracts, setLiveContracts] = useState<Contract[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<PromissoryNote[] | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!configured || !userId) {
      setLiveContracts(null);
      setLiveNotes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [contractRows, noteRows] = await Promise.all([
        listCustomerContracts(userId).catch(() => []),
        listCustomerNotes(userId).catch(() => []),
      ]);
      if (cancelled) return;
      setLiveContracts(
        contractRows
          .filter((c) => c.status !== 'ended' && c.status !== 'cancelled')
          .map((r) => adaptContract(r)),
      );
      setLiveNotes(noteRows.map((r) => adaptNote(r)));
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, session?.user?.id]);

  const contracts = liveContracts ?? demoContracts;
  const notes = liveNotes ?? demoNotes;

  return (
    <>
      <Header title={t('contracts.title')} />
      <Screen className="bg-canvas">
        {/* New contracts */}
        <section>
          <SectionHeader title={t('contracts.sections.newContracts')} />
          {contracts.length === 0 ? (
            <EmptyState
              icon={<DocIcon size={22} />}
              title={t('contracts.sections.noContracts')}
            />
          ) : (
            <Card padded={false} className="px-5">
              {contracts.map((c, i, arr) => (
                <div key={c.id}>
                  <ContractRow contract={c} />
                  <HandoverPhotoBanner
                    contractId={c.id}
                    contractRef={c.id}
                  />
                  {i < arr.length - 1 && (
                    <div className="h-px bg-canvas-200/80 my-1" />
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>

        {/* Promissory notes */}
        <section>
          <SectionHeader title={t('contracts.sections.notes')} />
          {notes.length === 0 ? (
            <EmptyState
              icon={<WalletIcon size={22} />}
              title={t('contracts.sections.noNotes')}
            />
          ) : (
            <Card padded={false} className="px-5">
              {notes.map((n, i, arr) => (
                <div key={n.id}>
                  <NoteRow note={n} />
                  {i < arr.length - 1 && (
                    <div className="h-px bg-canvas-200/80" />
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>
      </Screen>
    </>
  );
}

// =====================================================================
// Handover photo banner.
//
// Shown directly under each active contract row. Required action for
// the customer at the moment of physical handover from the merchant.
//
// Client-side state model (intentionally minimal):
//   localStorage key:  lend.handover.<contractId>.captured  = '1' | null
//   localStorage key:  lend.handover.<contractId>.dataUrl   = <preview>
//
// We persist the dataUrl so the customer can re-see the photo they
// captured if they reload the page; the file itself is also POSTed
// to the existing damage-evidence Storage bucket under
// handover/<contractId>/<timestamp>.jpg when configured. Upload
// failure does NOT block the local "captured" flag — the photo is
// still recorded locally, and the user is told to retry uploading
// when they have a connection.
// =====================================================================

function HandoverPhotoBanner({
  contractId,
  contractRef,
}: {
  contractId: string;
  contractRef: string;
}) {
  const t = useT();
  const { configured } = useSupabaseAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const capturedKey = `lend.handover.${contractId}.captured`;
  const previewKey = `lend.handover.${contractId}.dataUrl`;

  const [captured, setCaptured] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(capturedKey) === '1';
  });
  const [preview, setPreview] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(previewKey);
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onFileSelected = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      // Persist client-side first so a failed upload still records
      // the customer's action.
      window.localStorage.setItem(capturedKey, '1');
      window.localStorage.setItem(previewKey, dataUrl);
      setCaptured(true);
      setPreview(dataUrl);

      if (configured) {
        try {
          const { uploadDamageEvidence } = await import('@/lib/supabase');
          await uploadDamageEvidence({
            caseId: `handover-${contractId}`,
            file,
            evidenceType: 'photo',
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[lend] handover photo upload failed', err);
          setUploadError(t('contracts.handover.uploadFailed'));
        }
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={cn(
        'mx-3.5 my-2 rounded-xl2 p-3.5 ring-1',
        captured
          ? 'bg-success-50 ring-success-500/20'
          : 'bg-warn-50 ring-warn-500/25',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'h-9 w-9 shrink-0 rounded-xl grid place-items-center ring-1',
            captured
              ? 'bg-white text-success-600 ring-success-500/20'
              : 'bg-white text-warn-600 ring-warn-500/25',
          )}
        >
          {captured ? <CheckIcon size={16} /> : <CameraIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-[12.5px] font-semibold',
              captured ? 'text-success-700' : 'text-warn-800',
            )}
          >
            {captured
              ? t('contracts.handover.done')
              : t('contracts.handover.title')}
          </div>
          {!captured && (
            <div className="mt-0.5 text-[11.5px] text-warn-700/85 leading-relaxed">
              {t('contracts.handover.hint')}
            </div>
          )}
        </div>
      </div>

      {captured && preview && (
        <div className="mt-3">
          <img
            src={preview}
            alt={t('contracts.handover.done')}
            className="rounded-xl2 ring-1 ring-canvas-200 max-h-44 object-cover w-full"
          />
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label={t('contracts.handover.captureFor', { ref: contractRef })}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFileSelected(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 transition-colors',
            captured
              ? 'bg-white text-success-700 ring-1 ring-success-500/20 hover:bg-success-50/70'
              : 'bg-warn-600 text-white hover:bg-warn-700',
            uploading && 'opacity-60 cursor-not-allowed',
          )}
        >
          <CameraIcon size={14} />
          {uploading
            ? t('contracts.handover.uploading')
            : captured
              ? t('contracts.handover.retake')
              : t('contracts.handover.capture')}
        </button>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="mt-2 text-[11.5px] text-danger-700 leading-relaxed"
        >
          {uploadError}
        </div>
      )}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
