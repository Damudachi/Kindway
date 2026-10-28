import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance as RNAppearance, StyleSheet, useColorScheme } from 'react-native';

import { jsonStorage, type StateStorage } from '@/storage/persistence';
import { palettes, tints, trailTint, types, type Palette, type Scheme, type Tint, type TypeRoles } from '@/theme/tokens';

type Styles = Parameters<typeof StyleSheet.create>[0];

/** What the user picked in Settings: follow the phone, or always light / always night. */
export type Appearance = 'system' | 'light' | 'night';

type Theme = {
  scheme: Scheme;
  color: Palette;
  type: TypeRoles;
  /** The hue for a feeling or compass area; the trail's own colours when it has none. */
  tint: Tinter;
  appearance: Appearance;
  setAppearance(next: Appearance): Promise<void>;
};

type Tinter = { feeling(name?: string): Tint; area(name?: string): Tint };

function tinter(scheme: Scheme): Tinter {
  const fallback = trailTint(palettes[scheme]);
  return {
    feeling: (name) => (name && tints[scheme].feeling[name]) || fallback,
    area: (name) => (name && tints[scheme].area[name]) || fallback,
  };
}

const tinters: Record<Scheme, Tinter> = { light: tinter('light'), night: tinter('night') };

const lightTheme: Theme = {
  scheme: 'light',
  color: palettes.light,
  type: types.light,
  tint: tinters.light,
  appearance: 'system',
  setAppearance: async () => {},
};

const ThemeContext = createContext<Theme>(lightTheme);

/** A device-level choice, kept apart from the journal and from the session's device settings. */
export const appearanceStorage = jsonStorage('kindway:appearance:v1');

const isAppearance = (v: unknown): v is Appearance => v === 'system' || v === 'light' || v === 'night';

/** Tells native views (system bars, dialogs, pickers) which scheme the app is in. The web has no such call. */
function applyNative(appearance: Appearance) {
  RNAppearance.setColorScheme?.(appearance === 'system' ? 'auto' : appearance === 'night' ? 'dark' : 'light');
}

type Props = { children: ReactNode; /** Test seam. */ storage?: StateStorage };

export function ThemeProvider({ children, storage = appearanceStorage }: Props) {
  const [appearance, setState] = useState<Appearance | null>(null);
  const system = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    storage
      .load()
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        const saved = (raw as { appearance?: unknown } | null)?.appearance;
        const next = isAppearance(saved) ? saved : 'system';
        applyNative(next);
        setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setAppearance = useCallback(
    async (next: Appearance) => {
      applyNative(next);
      setState(next);
      await storage.save({ appearance: next });
    },
    [storage],
  );

  const value = useMemo<Theme | null>(() => {
    if (appearance === null) return null;
    const scheme: Scheme = appearance === 'system' ? (system === 'dark' ? 'night' : 'light') : appearance;
    return { scheme, color: palettes[scheme], type: types[scheme], tint: tinters[scheme], appearance, setAppearance };
  }, [appearance, system, setAppearance]);

  // Wait for the saved choice (a local read) so a night user never sees a light frame.
  if (!value) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Styles that follow the theme: `const useStyles = makeStyles((color, type) => ({ ... }))` at
 * module level, then `const styles = useStyles()` in the component. Both schemes' sheets are
 * built once, up front.
 */
export function makeStyles<T extends Styles>(factory: (color: Palette, type: TypeRoles) => T & Styles) {
  const sheets: Record<Scheme, Readonly<T>> = {
    light: StyleSheet.create(factory(palettes.light, types.light)),
    night: StyleSheet.create(factory(palettes.night, types.night)),
  };
  return function useStyles(): Readonly<T> {
    return sheets[useTheme().scheme];
  };
}
