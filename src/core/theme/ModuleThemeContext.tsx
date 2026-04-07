import React, { createContext, useContext, useMemo } from 'react';
import { MODULE_MANIFEST, ModuleId, ModuleTheme } from '@/lib/module-manifest';
import { MODULE_THEME_TOKENS, ModuleThemeTokens } from './module-themes';

interface ModuleThemeContextValue {
  themeColor: ModuleTheme;
  tokens: ModuleThemeTokens;
}

const ModuleThemeContext = createContext<ModuleThemeContextValue>({
  themeColor: 'indigo',
  tokens: MODULE_THEME_TOKENS.indigo,
});

interface ModuleThemeProviderProps {
  moduleId: ModuleId;
  children: React.ReactNode;
}

export function ModuleThemeProvider({ moduleId, children }: ModuleThemeProviderProps) {
  const { themeColor } = MODULE_MANIFEST[moduleId];
  const tokens = MODULE_THEME_TOKENS[themeColor];

  const cssVars = useMemo(() => ({
    '--module-accent': tokens.accent,
    '--module-accent-hover': tokens.accentHover,
    '--module-accent-muted': tokens.accentMuted,
    '--module-accent-faint': tokens.accentFaint,
    '--module-accent-border': tokens.accentBorder,
    '--module-accent-ring': tokens.accentRing,
  } as React.CSSProperties), [tokens]);

  const value = useMemo<ModuleThemeContextValue>(() => ({ themeColor, tokens }), [themeColor, tokens]);

  return (
    <ModuleThemeContext.Provider value={value}>
      <div style={cssVars}>{children}</div>
    </ModuleThemeContext.Provider>
  );
}

export function useModuleTheme(): ModuleThemeContextValue {
  return useContext(ModuleThemeContext);
}
