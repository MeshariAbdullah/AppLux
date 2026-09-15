/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_ORIGIN?: string;
  readonly VITE_OTP_PROVIDER?: string;
  readonly VITE_RENTER_OTP_PROVIDER?: string;
  readonly VITE_REGISTRATION_OTP_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
