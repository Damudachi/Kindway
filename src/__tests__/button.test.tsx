import { render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { alpha, palettes } from '@/theme/tokens';

const light = palettes.light;

// QA 2026-10-24: a disabled "Allow and send" looked the same as the "Cancel" beside it.
test('a disabled text button is clearly muted next to an enabled one', async () => {
  await render(
    <>
      <Button variant="text" label="Cancel" />
      <Button variant="text" label="Allow and send" disabled />
    </>,
  );
  expect(screen.getByText('Cancel')).toHaveStyle({ color: light.trail });
  expect(screen.getByText('Allow and send')).toHaveStyle({ color: alpha(light.ink, 0.38) });
  expect(screen.getByRole('button', { name: 'Allow and send' })).toBeDisabled();
});
