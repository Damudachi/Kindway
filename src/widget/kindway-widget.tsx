import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { palettes, type Scheme } from '@/theme/tokens';
import type { WidgetSnapshot } from '@/widget/content';

export const WIDGET_NAME = 'Kindway';

type Props = WidgetSnapshot & { prompt: string; scheme: Scheme };

/**
 * The home-screen widget: today's prompt, or the open Tomorrow Bridge step, and a way to write.
 * Drawn by Android from this description (RemoteViews), not as a React Native view.
 */
export function KindwayWidget({ prompt, step, stepDue, scheme }: Props) {
  // The widget library calls this as a plain function, where hooks throw; the React Compiler's
  // memo cache is a hook, so this component opts out of it.
  'use no memo';
  // The palette's colours are all hex; the widget library wants that spelled out in the type.
  const c = palettes[scheme] as Record<keyof (typeof palettes)['light'], `#${string}`>;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: step ? 'kindway://today' : 'kindway://write' }}
      accessibilityLabel={step ? `Kindway. Your step: ${step}. Open Today.` : `Kindway. ${prompt} Write a thought.`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: c.raised,
        borderRadius: 24,
        padding: 16,
      }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: step ? c.lichen : c.lantern, marginRight: 8 }} />
        <TextWidget text={step ? (stepDue === 'today' ? 'Your step for today' : 'Your step for tomorrow') : 'Kindway'} style={{ fontSize: 13, color: c.inkMuted }} />
      </FlexWidget>
      <TextWidget
        text={step ?? prompt}
        maxLines={3}
        truncate="END"
        style={{ fontSize: 17, color: c.ink, fontFamily: 'Literata_400Regular', marginTop: 6, marginBottom: 10 }}
      />
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'kindway://write' }}
        accessibilityLabel="Write a thought"
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}>
        <TextWidget text="Write a thought" style={{ fontSize: 14, color: c.onPrimary, fontWeight: '500' }} />
      </FlexWidget>
    </FlexWidget>
  );
}
