import { useState } from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog } from '@/components/feedback';
import { Text } from '@/components/text';
import { daysAgo, longDate, now, onDay, startOfDay } from '@/data/dates';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

type Props = {
  visible: boolean;
  /** The current date, as ISO. Its time of day is kept. */
  value: string;
  onCancel: () => void;
  onSave: (iso: string) => void;
};

const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A day stepper with Today and Yesterday shortcuts. Future days can't be chosen. */
export function DateDialog({ visible, ...rest }: Props) {
  // Mounted only while open, so it always starts from the current date.
  return visible ? <OpenDateDialog {...rest} /> : null;
}

function OpenDateDialog({ value, onCancel, onSave }: Omit<Props, 'visible'>) {
  const styles = useStyles();
  const [day, setDay] = useState(() => startOfDay(new Date(value)));

  const today = startOfDay(now());
  const ago = daysAgo(day.toISOString());

  return (
    <Dialog
      visible
      title="Change date"
      body="Choose the day this entry belongs to. The time of day stays as it was."
      confirmLabel="Save"
      onCancel={onCancel}
      onConfirm={() => onSave(onDay(value, day))}>
      <View style={styles.stepper}>
        <IconButton icon="chevron-left" label="Previous day" onPress={() => setDay((d) => plusDays(d, -1))} />
        <Text variant="label" style={styles.day} accessibilityLiveRegion="polite">
          {longDate(day.toISOString())}
        </Text>
        <IconButton icon="chevron-right" label="Next day" disabled={ago <= 0} onPress={() => setDay((d) => plusDays(d, 1))} />
      </View>
      <ChipRow>
        <Chip label="Today" selected={ago === 0} onPress={() => setDay(today)} />
        <Chip label="Yesterday" selected={ago === 1} onPress={() => setDay(plusDays(today, -1))} />
      </ChipRow>
    </Dialog>
  );
}

const useStyles = makeStyles(() => ({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  day: { flex: 1, textAlign: 'center' },
}));
