'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { sendEvent, sendHistory } from '@/lib/api';
import { KEYS, readJSON, removeKey, writeJSON } from '@/lib/storage';
import type { Department } from '@/lib/types';
import { uuid } from '@/lib/utils';

const MAX_ITEMS = 20;

/** Preferences the visitor declared through the style quiz / onboarding (Level-2 elicitation). */
export type DeclaredPrefs = {
  preferredDepartment?: Department;
  gender?: string;
  ageGroup?: string;
};

type SessionState = {
  ready: boolean;
  visitorId: string;
  viewedItems: string[];
  cartedItems: string[];
  explainMode: boolean;
  /** declared preferences (style quiz) */
  declared: DeclaredPrefs;
  quizDismissed: boolean;
  setExplainMode: (v: boolean) => void;
  recordView: (id: string) => void;
  recordCart: (id: string) => void;
  /** merge declared preferences; pass undefined for a key to clear it */
  setDeclared: (patch: DeclaredPrefs) => void;
  clearDeclared: () => void;
  dismissQuiz: () => void;
  /** Forget everything about this visitor (session memory, declared preferences + visitor id). */
  resetVisitor: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

function pushFront(list: string[], id: string) {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_ITEMS);
}

function cleanPrefs(p: DeclaredPrefs): DeclaredPrefs {
  const out: DeclaredPrefs = {};
  if (p.preferredDepartment) out.preferredDepartment = p.preferredDepartment;
  if (p.gender) out.gender = p.gender;
  if (p.ageGroup) out.ageGroup = p.ageGroup;
  return out;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [visitorId, setVisitorId] = useState('');
  const [viewedItems, setViewed] = useState<string[]>([]);
  const [cartedItems, setCarted] = useState<string[]>([]);
  const [explainMode, setExplain] = useState(false);
  const [declared, setDeclaredState] = useState<DeclaredPrefs>({});
  const [quizDismissed, setQuizDismissed] = useState(false);

  useEffect(() => {
    let id = readJSON<string>(KEYS.visitorId, '');
    if (!id) {
      id = uuid();
      writeJSON(KEYS.visitorId, id);
    }
    setVisitorId(id);
    setViewed(readJSON<string[]>(KEYS.viewed, []));
    setCarted(readJSON<string[]>(KEYS.carted, []));
    setExplain(readJSON<boolean>(KEYS.explain, false));
    setDeclaredState(cleanPrefs(readJSON<DeclaredPrefs>(KEYS.declared, {})));
    setQuizDismissed(readJSON<boolean>(KEYS.quizDismissed, false));
    setReady(true);
  }, []);

  const recordView = useCallback(
    (id: string) => {
      setViewed((prev) => {
        const next = pushFront(prev, id);
        writeJSON(KEYS.viewed, next);
        return next;
      });
      sendEvent({ visitorId, type: 'view_item', itemId: id });
      // persisted history: makes returning visitors Level 4 even when signed out
      sendHistory({ visitorId, type: 'view_item', itemId: id });
    },
    [visitorId],
  );

  const recordCart = useCallback(
    (id: string) => {
      setCarted((prev) => {
        const next = pushFront(prev, id);
        writeJSON(KEYS.carted, next);
        return next;
      });
      sendEvent({ visitorId, type: 'add_to_cart', itemId: id });
      sendHistory({ visitorId, type: 'add_to_cart', itemId: id });
    },
    [visitorId],
  );

  const setExplainMode = useCallback((v: boolean) => {
    setExplain(v);
    writeJSON(KEYS.explain, v);
  }, []);

  const setDeclared = useCallback((patch: DeclaredPrefs) => {
    setDeclaredState((prev) => {
      const next = cleanPrefs({ ...prev, ...patch });
      writeJSON(KEYS.declared, next);
      return next;
    });
  }, []);

  const clearDeclared = useCallback(() => {
    removeKey(KEYS.declared);
    setDeclaredState({});
  }, []);

  const dismissQuiz = useCallback(() => {
    setQuizDismissed(true);
    writeJSON(KEYS.quizDismissed, true);
  }, []);

  const resetVisitor = useCallback(() => {
    [KEYS.visitorId, KEYS.viewed, KEYS.carted, KEYS.bag, KEYS.wishlist, KEYS.declared, KEYS.quizDismissed, KEYS.checkout].forEach(removeKey);
    const id = uuid();
    writeJSON(KEYS.visitorId, id);
    setVisitorId(id);
    setViewed([]);
    setCarted([]);
    setDeclaredState({});
    setQuizDismissed(false);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      visitorId,
      viewedItems,
      cartedItems,
      explainMode,
      declared,
      quizDismissed,
      setExplainMode,
      recordView,
      recordCart,
      setDeclared,
      clearDeclared,
      dismissQuiz,
      resetVisitor,
    }),
    [ready, visitorId, viewedItems, cartedItems, explainMode, declared, quizDismissed, setExplainMode, recordView, recordCart, setDeclared, clearDeclared, dismissQuiz, resetVisitor],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
