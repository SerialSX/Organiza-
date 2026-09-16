/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1A2E',
    background: '#F5F5FA',
    backgroundElement: '#EAEAF0',
    backgroundSelected: '#DDDDE6',
    textSecondary: '#6B6B80',
    accent: '#7C5CFF',
    accentSoft: '#EDE8FF',
    inputBackground: '#FFFFFF',
    inputBorder: '#D8D8E4',
    placeholder: '#9A94B0',
    gradientStart: '#7C5CFF',
    gradientEnd: '#5A3FD9',
    statusPaid: '#2ECC71',
    statusPending: '#F0A500',
  },
  dark: {
    text: '#F0EEF6',
    background: '#0B0F1A',
    backgroundElement: '#141829',
    backgroundSelected: '#1C2137',
    textSecondary: '#9A94B0',
    accent: '#7C5CFF',
    accentSoft: '#1E1640',
    inputBackground: 'rgba(255,255,255,0.07)',
    inputBorder: 'rgba(255,255,255,0.10)',
    placeholder: '#6B6580',
    gradientStart: '#7C5CFF',
    gradientEnd: '#4A2FB0',
    statusPaid: '#2ECC71',
    statusPending: '#F0A500',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
