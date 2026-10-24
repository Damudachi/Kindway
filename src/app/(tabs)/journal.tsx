import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Trail, TrailStop } from '@/components/trail';
import { relativeDay } from '@/data/dates';
import { useEntries, useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Journal() {
  const styles = useStyles();
  const { tint } = useTheme();
  const { state } = useStore();
  const entries = useEntries();
  const [query, setQuery] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Brief simulated load so the loading state is reviewable.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const feelings = useMemo(() => [...new Set(entries.flatMap((e) => e.feelings))], [entries]);
  const q = query.trim().toLowerCase();
  const shown = entries.filter(
    (e) => (!feeling || e.feelings.includes(feeling)) && (!q || `${e.title} ${e.body} ${e.gratitude ?? ''}`.toLowerCase().includes(q)),
  );
  const hasSample = entries.some((e) => e.sample);

  return (
    <Screen inTabs top={{ title: 'Journal', actions: <IconButton icon="plus" label="New entry" onPress={() => router.push('/write')} /> }}>
      <Text variant="headline" accessibilityRole="header">
        Look back with kindness.
      </Text>

      {entries.length === 0 && !loading ? (
        <StateView
          art="trailhead"
          title="Nothing here yet"
          body="Your entries will appear here, in your own words. There's no pace to keep."
          action={<Button label="Write your first entry" onPress={() => router.push('/write')} />}
        />
      ) : (
        <>
          <View style={styles.search}>
            <Field label="Search your journal" placeholder="Words, people, places" value={query} onChangeText={setQuery} returnKeyType="search" />
          </View>
          {feelings.length > 0 && (
            <ChipRow>
              <Chip label="All entries" selected={!feeling} onPress={() => setFeeling(null)} />
              {feelings.map((f) => (
                <Chip key={f} label={f} tint={tint.feeling(f)} selected={feeling === f} onPress={() => setFeeling(feeling === f ? null : f)} />
              ))}
            </ChipRow>
          )}

          {loading ? (
            <View style={styles.skeletons} accessibilityLabel="Loading entries" accessibilityLiveRegion="polite">
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeleton} />
              ))}
            </View>
          ) : shown.length === 0 ? (
            <StateView
              title="No entries match"
              body={q ? `Nothing found for “${query.trim()}”. Try another word or clear the filter.` : 'No entries with this feeling yet.'}
              action={
                <Button
                  variant="secondary"
                  label="Clear search"
                  onPress={() => {
                    setQuery('');
                    setFeeling(null);
                  }}
                />
              }
            />
          ) : (
            <View style={styles.list} accessibilityLiveRegion="polite">
              <Trail stagger>
                {shown.map((e, i) => (
                  <TrailStop
                    key={e.id}
                    blaze="painted"
                    tint={tint.feeling(e.feelings[0]).mark}
                    last={i === shown.length - 1}
                    onPress={() => router.push(`/entry/${e.id}`)}
                    accessibilityLabel={`${relativeDay(e.date)}: ${e.title}. ${e.feelings.join(', ')}. Open entry.`}>
                    <Text variant="labelSmall">
                      {relativeDay(e.date)}
                      {e.feelings.length > 0 ? ` · ${e.feelings.join(', ')}` : ''}
                    </Text>
                    <Text variant="entryTitle">{e.title}</Text>
                    <Text variant="small" numberOfLines={2}>
                      {e.body}
                    </Text>
                  </TrailStop>
                ))}
              </Trail>
            </View>
          )}

          {hasSample && (
            <Notice tone="demo" title="Sample entries">
              These entries are fictional examples. They exist only in this demo session.
            </Notice>
          )}
          <Button variant="text" label="Explore recurring patterns" trailingIcon="arrow-right" onPress={() => router.navigate('/patterns')} />
        </>
      )}
      {state.demo.ai === 'offline' && <Text variant="small">Offline: showing entries saved on this device.</Text>}
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  search: { marginTop: space.md },
  list: { marginTop: space.md, marginBottom: space.lg },
  skeletons: { gap: space.sm, marginVertical: space.lg },
  skeleton: { height: 64, borderRadius: 12, backgroundColor: color.sunk },
}));
