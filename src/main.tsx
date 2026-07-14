import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './lib/i18n';
import { installGlobalErrorCapture } from './lib/observability/globalCapture';
import { StoreProvider } from './lib/store';
import { SupabaseAuthProvider } from './lib/supabase';
import './index.css';

// Phase 6A: catch errors the React boundary can't (async chains, event
// handlers, unhandled rejections). Sanitized before any output.
installGlobalErrorCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <SupabaseAuthProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </SupabaseAuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
