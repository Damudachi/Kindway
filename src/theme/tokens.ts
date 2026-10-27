import type { TextStyle } from 'react-native';

/**
 * Kindway design tokens ("Trail Blazes" direction).
 * Stone-grey map paper, charcoal ink, one slate trail colour; at night, the trail at dusk.
 * Components read the active palette through `useTheme()` / `makeStyles()` in `theme.tsx`.
 */
const light = {
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
  lantern: '#AD721C', // the warm accent: tonight's open blaze, Write, Talk, saved moments (3.5:1, marks only)
  lanternInk: '#804D0C', // lantern as text (6.1:1 on paper)
  onLantern: '#F8F7F3',
  lanternContainer: '#F8E4CF', // demo notices
  onLanternContainer: '#513716',
  bar: '#E5EDF1', // navigation bar, tinted toward the trail
  primary: '#25272B', // the primary button: ink by day
  onPrimary: '#F8F7F3',
  primaryAccent: '#E5AB66', // a lantern icon on the primary button
  barIndicator: '#BCD3E2', // the active destination's pill
  card: '#FBFAF7', // a card: lifted off the paper by a soft shadow
  cardEdge: 'rgba(37,39,43,0.04)',
  cardShadow: '0px 1px 2px rgba(37,39,43,0.06), 0px 4px 14px rgba(37,39,43,0.06)',
};

export type Palette = typeof light;

/** Trail at dusk: blue-graphite ground, warm off-white ink, a moonlit slate trail. */
const night: Palette = {
  paper: '#14181D',
  raised: '#1B2027',
  sunk: '#101318',
  ink: '#ECE8E1', // 14.6:1 on paper
  inkMuted: '#B4B0A9', // 8.3:1 on paper
  pencil: '#A29E97', // 6.7:1 on paper
  onInk: '#14181D',
  trail: '#9DB4C4', // 8.3:1 on paper
  trailContainer: '#2B3B47',
  onTrailContainer: '#D5E2EB',
  sand: '#30363E',
  outline: '#7D848E', // 4.3:1 on raised
  lichen: '#A3B092',
  lichenInk: '#B9C4A8',
  danger: '#EE9A88',
  dangerContainer: '#3E2522',
  scrim: 'rgba(0,0,0,0.6)',
  lantern: '#E5AB66', // 8.8:1 on paper
  lanternInk: '#E5AB66',
  onLantern: '#14181D',
  lanternContainer: '#3B2A17',
  onLanternContainer: '#F4E1CC',
  bar: '#151D23',
  primary: '#E5AB66', // lantern on graphite at night
  onPrimary: '#14181D',
  primaryAccent: '#14181D',
  barIndicator: '#294355',
  card: '#1C2229', // a tone lighter than the paper; shadows don't read on a dark ground
  cardEdge: 'rgba(236,232,225,0.06)',
  cardShadow: '0px 1px 2px rgba(0,0,0,0.24)',
};

export type Scheme = 'light' | 'night';

export const palettes: Record<Scheme, Palette> = { light, night };

/**
 * A muted hue per feeling and per compass area, from one OKLCH family (same lightness and
 * chroma, hues ~45° apart). `mark` is for blazes and spokes (≥3.9:1 on paper), `container`/`on`
 * for selected chips (≥8.9:1). Colour never carries meaning alone: the label always stays.
 */
export type Tint = { mark: string; container: string; on: string };

export const tints: Record<Scheme, { feeling: Record<string, Tint>; area: Record<string, Tint> }> = {
  light: {
    feeling: {
      Overwhelmed: { mark: '#9D5F72', container: '#F6DBE2', on: '#512A37' },
      Grateful: { mark: '#A06252', container: '#F7DCD5', on: '#522C22' },
      Worried: { mark: '#946B39', container: '#F1E0CD', on: '#4C3211' },
      Hopeful: { mark: '#807636', container: '#E7E4CC', on: '#3F380E' },
      Proud: { mark: '#548255', container: '#D6E9D6', on: '#234024' },
      Calm: { mark: '#27847F', container: '#CCEAE7', on: '#00423F' },
      Lonely: { mark: '#427BA1', container: '#D1E6F7', on: '#163C54' },
      Tired: { mark: '#786AA1', container: '#E4DFF7', on: '#3A3154' },
    },
    area: {
      'Growth & learning': { mark: '#548255', container: '#D6E9D6', on: '#234024' },
      'Career & purpose': { mark: '#946B39', container: '#F1E0CD', on: '#4C3211' },
      Relationships: { mark: '#A06252', container: '#F7DCD5', on: '#522C22' },
      'Health & peace': { mark: '#27847F', container: '#CCEAE7', on: '#00423F' },
      Independence: { mark: '#427BA1', container: '#D1E6F7', on: '#163C54' },
      Creativity: { mark: '#936188', container: '#F1DBEB', on: '#4B2B44' },
      'Faith & meaning': { mark: '#786AA1', container: '#E4DFF7', on: '#3A3154' },
    },
  },
  night: {
    feeling: {
      Overwhelmed: { mark: '#DF9BAF', container: '#472D34', on: '#F7DDE4' },
      Grateful: { mark: '#E19E8D', container: '#482E27', on: '#F8DED7' },
      Worried: { mark: '#D4A875', container: '#43321E', on: '#F2E2D0' },
      Hopeful: { mark: '#BDB372', container: '#3A361D', on: '#E9E5CF' },
      Proud: { mark: '#8FC090', container: '#283B29', on: '#D9EAD9' },
      Calm: { mark: '#6BC3BD', container: '#1A3C3A', on: '#CFEBE9' },
      Lonely: { mark: '#7EB9E2', container: '#223848', on: '#D3E8F7' },
      Tired: { mark: '#B5A7E2', container: '#373148', on: '#E5E1F7' },
    },
    area: {
      'Growth & learning': { mark: '#8FC090', container: '#283B29', on: '#D9EAD9' },
      'Career & purpose': { mark: '#D4A875', container: '#43321E', on: '#F2E2D0' },
      Relationships: { mark: '#E19E8D', container: '#482E27', on: '#F8DED7' },
      'Health & peace': { mark: '#6BC3BD', container: '#1A3C3A', on: '#CFEBE9' },
      Independence: { mark: '#7EB9E2', container: '#223848', on: '#D3E8F7' },
      Creativity: { mark: '#D39DC7', container: '#422E3E', on: '#F2DDED' },
      'Faith & meaning': { mark: '#B5A7E2', container: '#373148', on: '#E5E1F7' },
    },
  },
};

/** The trail's own colours, for a feeling or area without a hue of its own. */
export const trailTint = (color: Palette): Tint => ({ mark: color.trail, container: color.trailContainer, on: color.onTrailContainer });

/** A palette colour at the given opacity (0–1), e.g. for ripples. */
export function alpha(hex: string, opacity: number) {
  return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
}

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
  lg: 16, // sheets
  card: 20, // cards
  xl: 28, // dialogs
  full: 999,
} as const;

/** Minimum touch target (Material: 48dp). */
export const touch = 48;

export const font = {
  // Kindway's own voice (page titles, section headings, the wordmark): Fraunces SemiBold, fully
  // soft, cut at two optical sizes (assets/fonts/README.md).
  title: 'Fraunces_SoftTitle',
  heading: 'Fraunces_SoftHeading',
  serif: 'Literata_400Regular',
  serifMedium: 'Literata_500Medium',
  serifItalic: 'Literata_400Regular_Italic',
  // Roboto is the Android system face, so UI text leaves fontFamily unset.
  sans: undefined,
} as const;

/** Type roles in a palette. Sizes are sp: React Native scales them with the system font size. */
function typeRoles(color: Palette) {
  return {
    display: { fontFamily: font.title, fontSize: 32, lineHeight: 40, letterSpacing: -0.6, color: color.ink },
    pageTitle: { fontFamily: font.title, fontSize: 30, lineHeight: 38, letterSpacing: -0.6, color: color.ink },
    headline: { fontFamily: font.serif, fontSize: 24, lineHeight: 32, letterSpacing: -0.2, color: color.ink },
    title: { fontFamily: font.heading, fontSize: 20, lineHeight: 28, letterSpacing: -0.1, color: color.ink },
    entry: { fontFamily: font.serif, fontSize: 18, lineHeight: 28, color: color.ink },
    entryTitle: { fontFamily: font.serif, fontSize: 17, lineHeight: 24, color: color.ink },
    body: { fontFamily: font.sans, fontSize: 16, lineHeight: 24, color: color.ink },
    bodyMuted: { fontFamily: font.sans, fontSize: 16, lineHeight: 24, color: color.inkMuted },
    small: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.inkMuted },
    label: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, fontWeight: '500', color: color.ink },
    labelSmall: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.4, color: color.inkMuted },
    pencil: { fontFamily: font.serifItalic, fontSize: 16, lineHeight: 24, color: color.pencil },
  } satisfies Record<string, TextStyle>;
}

export type TypeRoles = ReturnType<typeof typeRoles>;
export type TypeRole = keyof TypeRoles;

export const types: Record<Scheme, TypeRoles> = { light: typeRoles(light), night: typeRoles(night) };

export const motion = {
  short: 150,
  medium: 240,
  long: 360,
} as const;
