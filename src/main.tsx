import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './lib/i18n';
import { StoreProvider } from './lib/store';
import { SupabaseAuthProvider } from './lib/supabase';
import './index.css';

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
