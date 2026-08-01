import { useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { CheckIcon, DocIcon, PlusIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { logEvent } from '@/lib/observability/log';
import {
  ACCEPTED_DOC_EXT,
  MerchantDocUploadError,
  uploadMerchantDocument,
  type DocUploadError,
} from '@/lib/supabase/queries/merchantDocuments';

// =====================================================================
// CR-copy upload (onboarding Step 5). Uploads through the controlled
// Edge Function and reports the OPAQUE receipt up. Success is only ever
// shown once the SERVER confirms (a receipt is returned) — a locally
// selected file is never claimed as uploaded. Handles replace, delete,
// retry, and friendly per-cause errors (never a raw Storage error).
// =====================================================================

type UploadState =
  | { phase: 'empty' }
  | { phase: 'uploading'; fileName: string }
  | { phase: 'uploaded'; fileName: string; size: number; receipt: string }
  | { phase: 'error'; kind: DocUploadError };

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DocumentUploadField({
  receipt,
  onReceiptChange,
  invalid,
}: {
  receipt: string | null;
  onReceiptChange: (next: { receipt: string; fileName: string } | null) => void;
  invalid?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const [state, setState] = useState<UploadState>(
    receipt ? { phase: 'uploaded', fileName: '', size: 0, receipt } : { phase: 'empty' },
  );

  const errorCopy = (kind: DocUploadError): string => {
    switch (kind) {
      case 'unsupported_type':
        return t('merchant.register.documents.errors.type');
      case 'file_too_large':
        return t('merchant.register.documents.errors.size');
      case 'rate_limited':
        return t('merchant.register.documents.errors.rateLimited');
      default:
        return t('merchant.register.documents.errors.failed');
    }
  };

  const doUpload = async (file: File, replaceReceipt?: string | null) => {
    lastFileRef.current = file;
    setState({ phase: 'uploading', fileName: file.name });
    try {
      const res = await uploadMerchantDocument(file, { replaceReceipt });
      setState({ phase: 'uploaded', fileName: res.fileName, size: res.size, receipt: res.receipt });
      onReceiptChange({ receipt: res.receipt, fileName: res.fileName });
    } catch (err) {
      const kind = err instanceof MerchantDocUploadError ? err.kind : 'unknown';
      logEvent('rpc_failure', 'warn', { op: 'merchant_doc_upload', cause: kind });
      setState({ phase: 'error', kind });
      onReceiptChange(null);
    }
  };

  const pick = () => inputRef.current?.click();

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const replace = state.phase === 'uploaded' ? state.receipt : null;
    void doUpload(file, replace);
  };

  const remove = () => {
    lastFileRef.current = null;
    setState({ phase: 'empty' });
    onReceiptChange(null);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOC_EXT}
        className="hidden"
        onChange={onInput}
      />

      {state.phase === 'uploaded' ? (
        <div className="rounded-xl2 border border-green-500 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-green-600 text-white shrink-0">
              <CheckIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-green-800 truncate">
                {state.fileName || t('merchant.register.documents.uploaded')}
              </div>
              <div className="text-[11.5px] text-green-700">
                {t('merchant.register.documents.uploaded')}
                {state.size ? ` · ${humanSize(state.size)}` : ''}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={pick}>
              {t('merchant.register.documents.replace')}
            </Button>
            <Button size="sm" variant="ghost" onClick={remove}>
              {t('merchant.register.documents.delete')}
            </Button>
          </div>
        </div>
      ) : state.phase === 'uploading' ? (
        <div className="rounded-xl2 border border-beige-300 bg-white p-5 text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-lavender-300 border-t-lavender-600" />
          <div className="text-[12.5px] font-medium text-ink-700 truncate">
            {t('merchant.register.documents.uploading')}
          </div>
          <div className="text-[11.5px] text-ink-400 truncate">{state.fileName}</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          className={cn(
            'w-full rounded-xl2 border-2 border-dashed p-6 text-center transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-400',
            invalid
              ? 'border-danger-400 bg-danger-50/40'
              : 'border-beige-300 bg-white hover:border-lavender-300',
          )}
        >
          <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-beige-100 text-ink-500">
            {state.phase === 'error' ? <DocIcon size={18} /> : <PlusIcon size={18} />}
          </span>
          <div className="text-[13px] font-semibold text-ink-800">
            {t('merchant.register.documents.dropzone')}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-400">
            {t('merchant.register.documents.constraints')}
          </div>
          {state.phase === 'error' && (
            <div className="mt-2 text-[12px] font-medium text-danger-600">
              {errorCopy(state.kind)}
              {lastFileRef.current && (
                <span
                  className="ms-2 underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (lastFileRef.current) void doUpload(lastFileRef.current);
                  }}
                >
                  {t('merchant.register.documents.retry')}
                </span>
              )}
            </div>
          )}
        </button>
      )}
    </div>
  );
}
