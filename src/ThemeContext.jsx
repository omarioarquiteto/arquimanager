import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// --- Predefined Backgrounds ---
export const BACKGROUNDS = [
  {
    id: 'gradient-night',
    name: 'Noturno',
    type: 'gradient',
    value: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 70%, #1e3a5f 100%)',
  },
  {
    id: 'gradient-aurora',
    name: 'Aurora',
    type: 'gradient',
    value: 'linear-gradient(135deg, #064e3b 0%, #155e75 25%, #6d28d9 60%, #be185d 100%)',
  },
  {
    id: 'gradient-cosmos',
    name: 'Cosmos',
    type: 'gradient',
    value: 'radial-gradient(ellipse at 20% 50%, #1e1b4b 0%, #0f172a 50%), radial-gradient(ellipse at 80% 20%, #4c1d95 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, #164e63 0%, transparent 50%)',
  },
  {
    id: 'gradient-ocean',
    name: 'Oceano Profundo',
    type: 'gradient',
    value: 'linear-gradient(160deg, #0c4a6e 0%, #155e75 30%, #134e4a 60%, #0f766e 100%)',
  },
  {
    id: 'gradient-metal',
    name: 'Metal Escuro',
    type: 'gradient',
    value: 'linear-gradient(145deg, #1e293b 0%, #334155 30%, #1e293b 60%, #475569 100%)',
  },
  {
    id: 'gradient-crystal',
    name: 'Cristal',
    type: 'gradient',
    value: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 30%, #f8fafc 60%, #dbeafe 100%)',
  },
  {
    id: 'gradient-ember',
    name: 'Brasa',
    type: 'gradient',
    value: 'linear-gradient(135deg, #1c1917 0%, #44403c 25%, #78350f 55%, #92400e 80%, #1c1917 100%)',
  },
  {
    id: 'gradient-midnight',
    name: 'Meia-Noite',
    type: 'gradient',
    value: 'linear-gradient(180deg, #020617 0%, #0f172a 40%, #172554 100%)',
  },
];

const THEME_STORAGE_KEY = 'arqui_theme_prefs';

const defaultPrefs = {
  theme: 'classic',       // 'classic' | 'liquid'
  backgroundId: 'gradient-night',
  customBackground: null, // { type: 'color' | 'image', value: string }
};

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultPrefs, ...parsed };
      }
    } catch (e) { /* ignore */ }
    return defaultPrefs;
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) { /* ignore */ }
  }, [prefs]);

  // Apply CSS variables and classes to document
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Theme class
    root.classList.remove('theme-classic', 'theme-liquid');
    root.classList.add(`theme-${prefs.theme}`);

    // Resolve background
    let bgValue = '';
    if (prefs.customBackground) {
      if (prefs.customBackground.type === 'color') {
        bgValue = prefs.customBackground.value;
      } else if (prefs.customBackground.type === 'image') {
        bgValue = `url(${prefs.customBackground.value})`;
      }
    } else {
      const preset = BACKGROUNDS.find(b => b.id === prefs.backgroundId);
      if (preset) {
        bgValue = preset.value;
      }
    }

    root.style.setProperty('--app-background', bgValue);

    // For image backgrounds, set additional properties
    if (prefs.customBackground?.type === 'image') {
      root.style.setProperty('--app-bg-size', 'cover');
      root.style.setProperty('--app-bg-position', 'center');
      root.style.setProperty('--app-bg-attachment', 'fixed');
    } else {
      root.style.setProperty('--app-bg-size', 'cover');
      root.style.setProperty('--app-bg-position', 'center');
      root.style.setProperty('--app-bg-attachment', 'fixed');
    }

  }, [prefs]);

  const setTheme = useCallback((theme) => {
    setPrefs(prev => ({ ...prev, theme }));
  }, []);

  const setBackground = useCallback((backgroundId) => {
    setPrefs(prev => ({ ...prev, backgroundId, customBackground: null }));
  }, []);

  const setCustomColor = useCallback((color) => {
    setPrefs(prev => ({ ...prev, customBackground: { type: 'color', value: color } }));
  }, []);

  const setCustomImage = useCallback((imageDataUrl) => {
    setPrefs(prev => ({ ...prev, customBackground: { type: 'image', value: imageDataUrl } }));
  }, []);

  const clearCustomBackground = useCallback(() => {
    setPrefs(prev => ({ ...prev, customBackground: null }));
  }, []);

  const value = {
    theme: prefs.theme,
    backgroundId: prefs.backgroundId,
    customBackground: prefs.customBackground,
    isLiquid: prefs.theme === 'liquid',
    setTheme,
    setBackground,
    setCustomColor,
    setCustomImage,
    clearCustomBackground,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
