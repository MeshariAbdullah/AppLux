import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Session = { name: string; company: string } | null;

type StoreContextValue = {
  session: Session;
  setSession: (s: Session) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ name: 'مشاري', company: 'AppLux' });
  const value = useMemo(() => ({ session, setSession }), [session]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
