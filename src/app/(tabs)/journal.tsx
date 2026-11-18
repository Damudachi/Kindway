import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field, Segmented } from '@/components/controls';
import { StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TopicsList } from '@/components/topics-list';
import { Feelings, Trail, TrailStop } from '@/components/trail';
import { relativeDay } from '@/data/dates';
import { usePullToRefresh } from '@/state/cloud-sync';
import { useEntries, useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

type JournalView = 'entries' | 'topics' | 'kept';
const VIEWS: { id: JournalView; label: string }[] = [
  { id: 'entries', label: 'Entries' },
  { id: 'topics', label: 'Topics' },
  { id: 'kept', label: 'Kept' },
];
const asView = (v: string | undefined): JournalView => (v === 'topics' || v === 'kept' ? v : 'entries');

export default function Journal() {
  const styles = useStyles();
  const { tint } = useTheme();
  const { state } = useStore();
  const refresh = usePullToRefresh();
  const entries = useEntries();
  const [query, setQuery] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  // `view` in the route opens a given view; a pick made on this screen wins until the param changes.
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const [picked, setPicked] = useState<{ from: string | undefined; view: JournalView } | null>(null);
  const view = picked && picked.from === viewParam ? picked.view : asView(viewParam);

  const feelings = useMemo(() => [...new Set(entries.flatMap((e) => e.feelings))], [entries]);
  const q = query.trim().toLowerCase();
  const shown = entries.filter(
    (e) => (!feeling || e.feelings.includes(feeling)) && (!q || `${e.title} ${e.body} ${e.gratitude ?? ''}`.toLowerCase().includes(q)),
  );

  return (
    <Screen
      inTabs
      onRefresh={refresh}
      top={{ title: 'Journal', actions: <IconButton icon="plus" label="New entry" onPress={() => router.push('/write')} /> }}>
      <Text variant="headline" accessibilityRole="header">
        Look back with kindness.
      </Text>

      <View style={styles.views}>
        <Segmented label="Journal view" options={VIEWS} value={view} onChange={(v) => setPicked({ from: viewParam, view: v })} />
      </View>

      {view === 'topics' && <TopicsList />}
      {/* C4 replaces this with the kept words. */}
      {view === 'kept' && <Text variant="bodyMuted">Words you keep will appear here.</Text>}
      {view === 'entries' && (
        <>
          {entries.length === 0 ? (
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

              {shown.length === 0 ? (
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
                        <Text variant="labelSmall">{relativeDay(e.date)}</Text>
                        <Text variant="entryTitle">{e.title}</Text>
                        <Text variant="small" numberOfLines={2}>
                          {e.body}
                        </Text>
                        <Feelings names={e.feelings} />
                      </TrailStop>
                    ))}
                  </Trail>
                </View>
              )}

              <Button variant="tonal" label="Explore recurring patterns" trailingIcon="arrow-right" onPress={() => router.navigate('/patterns')} />
            </>
          )}
        </>
      )}
      {state.demo.ai === 'offline' && <Text variant="small">Offline: showing entries saved on this device.</Text>}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  views: { marginTop: space.md },
  search: { marginTop: space.md },
  list: { marginTop: space.md, marginBottom: space.lg },
}));
