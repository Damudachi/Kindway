import { Stack } from 'expo-router';

import { color } from '@/theme/tokens';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.paper },
        // Shared-axis feel: forward and back move along the same horizontal axis.
        animation: 'slide_from_right',
      }}
    />
  );
}
