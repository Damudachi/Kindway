import 'expo-router/entry';

import { widgetLib } from '@/widget/native';

// The home-screen widget is drawn in the background, without the app's screens; Android calls
// this handler for it. Skipped where the widget's native module isn't there (Expo Go, iOS).
const widgets = widgetLib();
if (widgets) widgets.registerWidgetTaskHandler(require('@/widget/task-handler').widgetTaskHandler);
