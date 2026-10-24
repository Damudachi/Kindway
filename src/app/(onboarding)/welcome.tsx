import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Welcome() {
  const styles = useStyles();
  return (
    <Screen
      top={false}
      scroll
      contentStyle={styles.content}
      footer={
        <>
          <Button label="Let's begin" trailingIcon="arrow-right" onPress={() => router.push('/support-style')} />
          <Button variant="text" label="I already have an account" onPress={() => router.push('/account?mode=signin')} style={styles.center} />
        </>
      }>
      <View style={styles.mark}>
        <View style={styles.line} />
        <Blaze />
        <View style={styles.line} />
        <Blaze state="open" />
      </View>
      <Text variant="title" style={styles.word}>
        Kindway
      </Text>
      <Text variant="display" accessibilityRole="header" style={styles.headline}>
        A place to come back to yourself.
      </Text>
      <View style={styles.lines}>
        <Text variant="body">Make sense of what happened today.</Text>
        <Text variant="body">Be honest about how you feel.</Text>
        <Text variant="body">Keep sight of what matters to you.</Text>
      </View>
      <Text variant="bodyMuted" style={styles.quiet}>
        You don’t have to figure everything out tonight. No streaks, no scores, no pressure.
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  content: { paddingTop: space.xxl },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.lg },
  line: { width: 28, height: 2, backgroundColor: color.trail, opacity: 0.45 },
  word: { marginBottom: space.xxl },
  headline: { marginBottom: space.lg },
  lines: { gap: space.xxs, marginBottom: space.lg },
  quiet: { maxWidth: 320 },
  center: { alignSelf: 'center' },
}));
