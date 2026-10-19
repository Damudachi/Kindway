import type { TextStyle } from 'react-native';

/**
 * Kindway design tokens ("Trail Blazes" direction).
 * Stone-grey map paper, charcoal ink, one slate trail colour.
 * Light scheme only for now; a dark scheme is deferred until it can be designed properly.
 */
export const color = {
  paper: '#F1EFEA', // app background
  raised: '#F8F7F3', // fields, sheets, dialogs
  sunk: '#E8E5DE', // navigation bar, quiet containers
  ink: '#25272B', // primary text, primary button
  inkMuted: '#55575B', // secondary text (7:1 on paper)
  pencil: '#66686B', // tentative / AI-proposed text (4.9:1 on paper)
  onInk: '#F8F7F3',
  trail: '#4D6474', // the trail line, blazes, links, selection
  trailContainer: '#D9E0E4', // selected chips, nav indicator
  onTrailContainer: '#22323D',
  sand: '#CFC8BB', // hairline dividers (decorative only)
  outline: '#8A857B', // borders of interactive controls (3.3:1 on paper)
  lichen: '#6F7C61', // the optional next-step blaze
  lichenInk: '#4E5A43', // text on lichen-related UI
  danger: '#9A3B2E', // destructive actions and errors
  dangerContainer: '#F3E1DC',
  scrim: 'rgba(37,39,43,0.42)',
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  gutter: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8, // chips, small controls
  md: 12, // fields
  lg: 16, // buttons, sheets
  xl: 28, // dialogs
  full: 999,
} as const;

/** Minimum touch target (Material: 48dp). */
export const touch = 48;

export const font = {
  serif: 'Literata_400Regular',
  serifMedium: 'Literata_500Medium',
  serifItalic: 'Literata_400Regular_Italic',
  // Roboto is the Android system face, so UI text leaves fontFamily unset.
  sans: undefined,
} as const;

/** Type roles. Sizes are sp: React Native scales them with the system font size. */
export const type = {
  display: { fontFamily: font.serif, fontSize: 32, lineHeight: 40, letterSpacing: -0.4, color: color.ink },
  headline: { fontFamily: font.serif, fontSize: 26, lineHeight: 34, letterSpacing: -0.2, color: color.ink },
  title: { fontFamily: font.serifMedium, fontSize: 20, lineHeight: 28, color: color.ink },
  entry: { fontFamily: font.serif, fontSize: 18, lineHeight: 28, color: color.ink },
  entryTitle: { fontFamily: font.serif, fontSize: 17, lineHeight: 24, color: color.ink },
  body: { fontFamily: font.sans, fontSize: 16, lineHeight: 24, color: color.ink },
  bodyMuted: { fontFamily: font.sans, fontSize: 16, lineHeight: 24, color: color.inkMuted },
  small: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.inkMuted },
  label: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, fontWeight: '500', color: color.ink },
  labelSmall: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.4, color: color.inkMuted },
  pencil: { fontFamily: font.serifItalic, fontSize: 16, lineHeight: 24, color: color.pencil },
} satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof type;

export const motion = {
  short: 150,
  medium: 240,
  long: 360,
} as const;
