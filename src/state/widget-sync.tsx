import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onWeb } from '@/services/platform';
import { useStore } from '@/state/demo-store';
import { stepView } from '@/state/tomorrow';
import type { WidgetSnapshot } from '@/widget/content';
import { updateWidget } from '@/widget/native';

/** What the widget may show for this journal: the open step, if the user allows it. */
export function widgetSnapshot(step: ReturnType<typeof useStore>['state']['tomorrow'], showStep: boolean, at = new Date()): WidgetSnapshot {
  const view = stepView(step, at);
  if (!showStep || !step || (view !== 'due' && view !== 'upcoming')) return { step: null, stepDue: null };
  return { step: step.text, stepDue: view === 'due' ? 'today' : 'tomorrow' };
}

/**
 * Keeps the home-screen widget in step with the current journal. Redrawn when the step or the
 * setting changes, and when the app comes back (a new day changes the prompt). Nothing on the
 * web, which has no widget. Renders nothing.
 */
export function WidgetSync() {
  const { state } = useStore();
  const { tomorrow, widgetShowsStep } = state;
  useEffect(() => {
    if (onWeb()) return;
    const draw = () => void updateWidget(widgetSnapshot(tomorrow, widgetShowsStep)).catch(() => {});
    draw();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && draw());
    return () => sub.remove();
  }, [tomorrow, widgetShowsStep]);
  return null;
}
