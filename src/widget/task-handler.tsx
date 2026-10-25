import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { loadWidgetSnapshot, promptFor } from '@/widget/content';
import { KindwayWidget, WIDGET_NAME } from '@/widget/kindway-widget';

/** Draws the widget in light and night versions; Android picks one to match the system. */
export async function renderKindwayWidget() {
  const snapshot = await loadWidgetSnapshot();
  const prompt = promptFor();
  return { light: <KindwayWidget {...snapshot} prompt={prompt} scheme="light" />, dark: <KindwayWidget {...snapshot} prompt={prompt} scheme="night" /> };
}

/** Runs in the background when Android adds, refreshes or resizes the widget. Taps open links. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderKindwayWidget());
      break;
    default:
      break;
  }
}
