import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme';

export default function OnboardingLayout() {
  const { color } = useTheme();
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
