export type ThemeId = 'dark' | 'light' | 'sepia';

type ThemeButtonTokens = {
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  secondaryBg: string;
  secondaryText: string;
  secondaryBorder: string;
  icon: string;
};

export const THEME_TOKENS: Record<ThemeId, ThemeButtonTokens> = {
  dark: {
    primaryBg: '#7C5CFF',
    primaryHover: '#6A4BE6',
    primaryText: '#FFFFFF',
    secondaryBg: 'transparent',
    secondaryText: '#CFCFCF',
    secondaryBorder: '#2A2A2A',
    icon: '#E5E7EB',
  },
  light: {
    primaryBg: '#4F46E5',
    primaryHover: '#4338CA',
    primaryText: '#FFFFFF',
    secondaryBg: '#F3F4F6',
    secondaryText: '#111827',
    secondaryBorder: '#D1D5DB',
    icon: '#374151',
  },
  sepia: {
    primaryBg: '#8B5E3C',
    primaryHover: '#6E472C',
    primaryText: '#F5ECD9',
    secondaryBg: '#EFE3CC',
    secondaryText: '#5B4636',
    secondaryBorder: '#D1BFA5',
    icon: '#5B4636',
  },
};

export const applyThemeTokens = (theme: string) => {
  if (typeof document === 'undefined') return;

  const selected = (THEME_TOKENS[theme as ThemeId] || THEME_TOKENS.dark);
  const root = document.documentElement;

  root.style.setProperty('--button-primary-bg', selected.primaryBg);
  root.style.setProperty('--button-primary-hover', selected.primaryHover);
  root.style.setProperty('--button-primary-text', selected.primaryText);
  root.style.setProperty('--button-secondary-bg', selected.secondaryBg);
  root.style.setProperty('--button-secondary-text', selected.secondaryText);
  root.style.setProperty('--button-secondary-border', selected.secondaryBorder);
  root.style.setProperty('--auth-icon-color', selected.icon);
};
