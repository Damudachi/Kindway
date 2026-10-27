import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme/theme';
import { type TypeRole } from '@/theme/tokens';

type Props = TextProps & { variant?: TypeRole };

// Large display text may scale, but not so far that a heading pushes the action off screen.
const MAX_SCALE: Partial<Record<TypeRole, number>> = { display: 1.5, pageTitle: 1.5, headline: 1.6 };

export function Text({ variant = 'body', style, ...rest }: Props) {
  const { type } = useTheme();
  return <RNText maxFontSizeMultiplier={MAX_SCALE[variant]} style={[type[variant], style]} {...rest} />;
}
