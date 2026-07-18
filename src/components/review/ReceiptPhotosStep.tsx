import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { CameraIcon, CheckIcon, InfoIcon, PlusIcon, XIcon } from '@/components/icons';
import { translateError, withSupportId } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useT } from '@/lib/i18n';
import {
  getReceiptPhotoUrl,
  listContractReceiptPhotos,
  RECEIPT_MAX_PHOTOS,
  removeContractReceiptPhoto,
  uploadContractReceiptPhoto,
} from '@/lib/supabase';
import { cn } from '@/lib/cn';

// =====================================================================
// Receipt-photos step (Bugs 17/19) — the step the guided acceptance
// flow moves to IMMEDIATELY after the customer approves the offer and
// contract. Product rules enforced here (and server-side by the RPCs
// in 20260502122900_contract_receipt_photos.sql):
//   * minimum 1 / maximum 4 photos, captured by the CUSTOMER;
//   * every photo previews; add / remove / replace freely BEFORE
//     confirmation;
//   * confirmation locks the set permanently (no delete / replace /
//     retake) and is what unblocks activation;
//   * the confirm action is debounced client-side and idempotent
//     server-side — no duplicate confirmation submissions;
//   * previews come from short-lived signed URLs (live mode) or local
//     object URLs (demo mode) — storage paths are never rendered.
//
// Live persistence is REAL: each photo is an object in the private
// storage bucket + a contract_receipt_photos row before it ever shows
// as "uploaded". Demo mode (no Supabase) keeps the same UX with
// in-memory previews, consistent with every other demo surface.
// =====================================================================

type PhotoVM = {
  /** contract_receipt_photos.id (live) or a local key (demo). */
  id: string;
  /** Storage object key (live only) — used for RPC calls, NEVER shown. */
  storagePath: string | null;
  /** Signed URL (live) or object URL (demo) for the preview. */
  previewUrl: string | null;
};

export function ReceiptPhotosStep({
  live,
  contractId,
  locked,
  finalizing,
  onFinalize,
}: {
  /** Supabase configured — uploads persist for real. */
  live: boolean;
  /** Live contract id (exists once acceptance succeeded). */
  contractId: string | null;
  /** Photos already confirmed (resume after a failed activation) —
   *  gallery renders read-only and the CTA only retries activation. */
  locked: boolean;
  /** Parent is running confirm + activation. */
  finalizing: boolean;
  /** Confirm CTA — parent runs confirm RPC + activation + navigation. */
  onFinalize: () => Promise<void> | void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoVM[]>([]);
  const [loading, setLoading] = useState(live);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume path: load photos already registered on the contract.
  useEffect(() => {
    if (!live || !contractId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    listContractReceiptPhotos(contractId)
      .then(async (rows) => {
        const vms: PhotoVM[] = await Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            storagePath: r.storage_path,
            previewUrl: await getReceiptPhotoUrl(r.storage_path),
          })),
        );
        if (cancelled) return;
        setPhotos(vms);
      })
      .catch((err) => {
        logEvent('rpc_failure', 'warn', { op: 'list_receipt_photos' }, err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [live, contractId]);

  const addPhoto = async (file: File) => {
    if (photos.length >= RECEIPT_MAX_PHOTOS || locked) return;
    setError(null);
    if (!live || !contractId) {
      // Demo mode: local preview only — the demo store has no backend.
      setPhotos((p) => [
        ...p,
        {
          id: `demo-${p.length}-${file.name}`,
          storagePath: null,
          previewUrl: URL.createObjectURL(file),
        },
      ]);
      return;
    }
    setUploading(true);
    try {
      const row = await uploadContractReceiptPhoto({ contractId, file });
      const url = await getReceiptPhotoUrl(row.storage_path);
      setPhotos((p) => [
        ...p,
        { id: row.id, storagePath: row.storage_path, previewUrl: url },
      ]);
    } catch (err) {
      const eventId = logEvent(
        'rpc_failure',
        'error',
        { op: 'receipt_photo_upload' },
        err,
      );
      setError(withSupportId(translateError(err, t), eventId));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo: PhotoVM) => {
    if (locked || finalizing) return;
    setError(null);
    if (!live || !photo.storagePath) {
      setPhotos((p) => p.filter((x) => x.id !== photo.id));
      return;
    }
    try {
      await removeContractReceiptPhoto({
        id: photo.id,
        storage_path: photo.storagePath,
      });
      setPhotos((p) => p.filter((x) => x.id !== photo.id));
    } catch (err) {
      const eventId = logEvent(
        'rpc_failure',
        'error',
        { op: 'receipt_photo_remove' },
        err,
      );
      setError(withSupportId(translateError(err, t), eventId));
    }
  };

  const canConfirm = photos.length >= 1 && !uploading && !finalizing && !loading;

  return (
    <>
      {/* Step framing — what is asked and why it matters. */}
      <Card padded className="animate-reveal-up">
        <div className="flex items-start gap-2.5">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-green-50 text-green-700 grid place-items-center">
            <CameraIcon size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink-900">
              {t('review.photos.title')}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-500 leading-relaxed">
              {locked
                ? t('review.photos.lockedSubtitle')
                : t('review.photos.subtitle')}
            </div>
          </div>
        </div>
      </Card>

      {/* Gallery — previews + remove, and the add tile while slots
          remain. Everything freezes once locked. */}
      <Card padded className="animate-reveal-up" style={{ animationDelay: '80ms' }}>
        <div className="grid grid-cols-2 gap-2.5">
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className="relative aspect-[4/3] rounded-xl2 overflow-hidden ring-1 ring-beige-200 bg-beige-100"
            >
              {photo.previewUrl ? (
                <img
                  src={photo.previewUrl}
                  alt={t('review.photos.photoAlt', { n: i + 1 })}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full grid place-items-center text-ink-300">
                  <CameraIcon size={18} />
                </div>
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={() => void removePhoto(photo)}
                  disabled={finalizing}
                  aria-label={t('review.photos.remove', { n: i + 1 })}
                  className="absolute top-1.5 end-1.5 h-7 w-7 grid place-items-center rounded-full bg-white/95 text-danger-600 ring-1 ring-beige-200 shadow-soft active:scale-95 transition-transform"
                >
                  <XIcon size={13} strokeWidth={2.5} />
                </button>
              )}
              {locked && (
                <span className="absolute bottom-1.5 end-1.5 h-6 w-6 grid place-items-center rounded-full bg-green-700 text-white">
                  <CheckIcon size={12} strokeWidth={2.5} />
                </span>
              )}
            </div>
          ))}

          {!locked && photos.length < RECEIPT_MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || finalizing || loading}
              className={cn(
                'aspect-[4/3] rounded-xl2 border-2 border-dashed border-beige-300 text-ink-500',
                'flex flex-col items-center justify-center gap-1.5 transition-colors',
                'hover:border-green-500 hover:text-green-700 active:bg-green-50/40',
                (uploading || loading) && 'opacity-60',
              )}
            >
              {uploading ? (
                <span className="text-[12px] font-semibold">
                  {t('review.photos.uploading')}
                </span>
              ) : (
                <>
                  <PlusIcon size={18} />
                  <span className="text-[12px] font-semibold">
                    {photos.length === 0
                      ? t('review.photos.addFirst')
                      : t('review.photos.addMore')}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label={t('review.photos.title')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addPhoto(f);
            e.target.value = '';
          }}
        />

        <div className="mt-3 text-[11.5px] text-ink-400 num">
          {t('review.photos.countLine', {
            count: photos.length,
            max: RECEIPT_MAX_PHOTOS,
          })}
        </div>
      </Card>

      {/* The rule the confirmation enforces — stated BEFORE the act. */}
      {!locked && (
        <div className="rounded-xl2 bg-navy-50 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-navy-700 animate-reveal-up" style={{ animationDelay: '140ms' }}>
          <InfoIcon size={15} className="mt-0.5 shrink-0" />
          <span className="leading-relaxed">{t('review.photos.lockHint')}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed"
        >
          {error}
        </div>
      )}

      {/* Final action — confirm + activate. Guarded against double
          submission here AND idempotently server-side. */}
      <div className="pt-1 animate-reveal-up" style={{ animationDelay: '200ms' }}>
        <Button
          variant="primary"
          size="lg"
          block
          className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
          onClick={() => void onFinalize()}
          disabled={locked ? finalizing : !canConfirm}
          loading={finalizing}
          leading={!finalizing ? <CheckIcon size={17} /> : undefined}
        >
          {finalizing
            ? t('review.photos.confirming')
            : locked
              ? t('review.photos.retryActivate')
              : t('review.photos.confirmCta')}
        </Button>
        {!locked && (
          <p className="mt-2.5 text-center text-[11.5px] text-ink-400 leading-relaxed px-4">
            {photos.length === 0
              ? t('review.photos.minHint')
              : t('review.photos.afterHint')}
          </p>
        )}
      </div>
    </>
  );
}
