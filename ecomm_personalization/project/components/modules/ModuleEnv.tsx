'use client';

import { createContext, useContext } from 'react';

/**
 * Rendering environment for landing-page modules.
 * `compact` forces the mobile layout regardless of viewport (used by the Lab's phone frame),
 * `explain` shows the per-module "i" reasoning chips, `showWhy` shows per-item explanations.
 */
export type ModuleEnvValue = { compact: boolean; explain: boolean; showWhy: boolean; accent: string };

export const ModuleEnv = createContext<ModuleEnvValue>({ compact: false, explain: false, showWhy: false, accent: '#e11d48' });

export function useModuleEnv() {
  return useContext(ModuleEnv);
}

/** pick classes: compact → mobile classes, else responsive classes */
export function rc(compact: boolean, mobile: string, responsive: string) {
  return compact ? mobile : responsive;
}
