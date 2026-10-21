import AsyncStorage from '@react-native-async-storage/async-storage';
import { render as renderPlain, act as actPlain, screen as plainScreen } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { Text } from 'react-native';

import Patterns from '@/app/(tabs)/patterns';
import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import Tomorrow from '@/app/tomorrow';
import { SnackbarProvider } from '@/components/feedback';
import type { Entry, Reflection, TomorrowStep } from '@/data/types';
import { toReview, type AiOutputsRepo, type Invoke } from '@/services/ai/remote';
import { CloudSync } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, reducer, toSnapshot, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { SessionProvider, useSession, type AuthUser } from '@/state/session';
import { fitStep, newStep, STEP_MAX } from '@/state/tomorrow';
import type { AuthService } from '@/services/auth';
import { memoryStorage, scopedStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const BODY = 'Fictional: the deadline moved again and I stayed late.';
const STEP = 'Fictional step: start tomorrow with ten minutes on the hardest part.';
const reflection = (patch: Partial<Reflection> = {}): Reflection => ({
  style: 'forward',
  source: 'ai',
  ai: { id: 'ref-1', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-21T12:00:00.000Z' },
  acknowledge: 'Fictional acknowledgment.',
  nextStep: STEP,
  basedOn: BODY,
  ...patch,
});
const journal = (patch: Partial<Entry> = {}, state: Partial<DemoState> = {}): DemoState => ({
  ...initialState,
  onboarded: true,
  aiConsent: 'journal-only',
  entries: [entry('e1', 0, { body: BODY, title: 'Late again', reflection: reflection(), reflectionStatus: 'ready', ...patch })],
  ...state,
});

/** Every Tomorrow Bridge step the store has held, in order (null when there was none). */
let history: (TomorrowStep | null)[] = [];
function StepRecorder() {
  const { state } = useStore();
  useEffect(() => {
    history.push(state.tomorrow);
  }, [state.tomorrow]);
  return <Text>step:{state.tomorrow ? `${state.tomorrow.text}|${state.tomorrow.source?.kind ?? 'none'}|${state.tomorrow.status}` : 'none'}</Text>;
}

/** One journal shared by every screen, as in the app; AI is on but must never be called. */
async function open(state: DemoState, initialUrl: string, real: Partial<RealAi> = {}) {
  history = [];
  const invoke = jest.fn() as jest.Mock & Invoke;
  const value: RealAi = { reflections: true, insights: true, followUps: true, needs: null, account: 'user-a', invoke, outputs: null, ...real };
  function Layout() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={state}>
          <SnackbarProvider>
            <Stack />
            <StepRecorder />
          </SnackbarProvider>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  await renderRouter({ _layout: Layout, 'entry/[id]/index': EntryDetail, tomorrow: Tomorrow, today: Today, patterns: Patterns }, { initialUrl });
  return { invoke };
}

describe('saving a suggested step from a reflection', () => {
  it('only after the user opens it, sees where it came from, and saves; no AI request is made', async () => {
    const { invoke } = await open(journal(), '/entry/e1');
    expect(await screen.findByText(STEP, {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save to Tomorrow Bridge' }));
    expect(await screen.findByText('Suggested by AI in your reflection on “Late again”', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Written by AI, so it can be wrong. Change it, or leave it.')).toBeOnTheScreen();
    // In the field, but not saved yet.
    expect(screen.getByDisplayValue(STEP)).toBeOnTheScreen();
    expect(screen.getByText('step:none')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save my step' }));
    expect(await screen.findByText(`step:${STEP}|reflection|open`, {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
    // Back on the entry, it says it's saved rather than offering to save again.
    expect(await screen.findByText(/Saved to Tomorrow Bridge/, {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save to Tomorrow Bridge' })).toBeNull();
  });

  it('the wording can be changed before saving, and the changed text is what’s saved', async () => {
    await open(journal(), '/tomorrow?from=e1&use=1');
    await act(async () => fireEvent.changeText(await screen.findByDisplayValue(STEP), 'Fictional: ten minutes, then rest'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save my step' }));
    expect(await screen.findByText('step:Fictional: ten minutes, then rest|reflection|open', {}, wait)).toBeOnTheScreen();
  });

  it('leaving, or choosing to leave it open, saves nothing', async () => {
    await open(journal(), '/tomorrow?from=e1&use=1');
    await fireEvent.press(await screen.findByRole('button', { name: "I'd rather leave this open" }));
    await waitFor(() => expect(screen.getByText('step:none')).toBeOnTheScreen(), wait);
    expect(history.every((s) => s === null)).toBe(true);
  });

  it('a double tap on Save saves once', async () => {
    await open(journal(), '/tomorrow?from=e1&use=1');
    const save = await screen.findByRole('button', { name: 'Save my step' });
    await act(async () => {
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await waitFor(() => expect(history.filter(Boolean)).toHaveLength(1), wait);
  });

  it('no next step, a blank one, or a reflection without one: no button and nothing pre-filled', async () => {
    for (const nextStep of [undefined, '', '   ']) {
      await open(journal({ reflection: reflection({ nextStep }) }), '/entry/e1');
      expect(await screen.findByText('Fictional acknowledgment.', {}, wait)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Save to Tomorrow Bridge' })).toBeNull();
      expect(screen.queryByText('If you want a next step')).toBeNull();
    }
    await open(journal({ reflection: reflection({ nextStep: '  ' }) }), '/tomorrow?from=e1&use=1');
    expect(await screen.findByText('What would help future-you?', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Suggested by AI/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save my step' })).toBeDisabled();
  });

  it('an entry from another journal (or a missing one) gives no suggestion and no source link', async () => {
    await open(journal(), '/tomorrow?from=someone-elses&use=1');
    expect(await screen.findByText('What would help future-you?', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Suggested by AI|Simulated suggestion/)).toBeNull();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Or in your own words'), 'Fictional own step'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save my step' }));
    expect(await screen.findByText('step:Fictional own step|none|open', {}, wait)).toBeOnTheScreen();
  });

  it('a simulated reflection’s step is labelled simulated, never as AI', async () => {
    await open(journal({ reflection: reflection({ source: 'simulated', ai: undefined }) }), '/tomorrow?from=e1&use=1');
    expect(await screen.findByText('Simulated suggestion from your reflection preview on “Late again”', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Pre-written text, not generated from your words.')).toBeOnTheScreen();
    expect(screen.queryByText(/Suggested by AI/)).toBeNull();
  });

  it('a long suggestion is shortened at a word and says so', async () => {
    const long = `Fictional ${'word '.repeat(40)}end`;
    const fitted = fitStep(long);
    expect(fitted.shortened).toBe(true);
    expect(fitted.text.length).toBeLessThanOrEqual(STEP_MAX);
    expect(fitted.text.endsWith('word…')).toBe(true);
    await open(journal({ reflection: reflection({ nextStep: long }) }), '/tomorrow?from=e1&use=1');
    expect(await screen.findByText('Shortened to fit one line. Edit it if you like.', {}, wait)).toBeOnTheScreen();
  });
});

describe('an existing step is never replaced silently', () => {
  const mine = newStep('Fictional: my own step');

  it('the field keeps my step; a suggestion is offered but changes nothing until I choose it and update', async () => {
    await open(journal({}, { tomorrow: mine }), '/tomorrow?from=e1&use=1');
    expect(await screen.findByDisplayValue('Fictional: my own step', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('You already have a step')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Use this instead' }));
    expect(screen.getByText('step:Fictional: my own step|none|open')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Update my step' }));
    expect(await screen.findByText(`step:${STEP}|reflection|open`, {}, wait)).toBeOnTheScreen();
    // Same day as before; it was edited, not re-planned.
    expect(history.at(-1)?.dueOn).toBe(mine.dueOn);
  });
});

describe('the saved step keeps the usual Tomorrow Bridge choices', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const saved = newStep(STEP, { kind: 'reflection', entryId: 'e1' }, yesterday);

  it('done, then “Did it help?”', async () => {
    await open(journal({}, { tomorrow: saved }), '/today');
    await fireEvent.press(await screen.findByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Done today', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'It helped' }));
    await waitFor(() => expect(history.at(-1)).toMatchObject({ status: 'done', outcome: 'helped', source: { kind: 'reflection', entryId: 'e1' } }), wait);
  });

  it('move to tomorrow, and let it go', async () => {
    await open(journal({}, { tomorrow: saved }), '/today');
    await fireEvent.press(await screen.findByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Move to tomorrow' }));
    expect(await screen.findByText('Tomorrow · optional', {}, wait)).toBeOnTheScreen();
    await open(journal({}, { tomorrow: saved }), '/today');
    await fireEvent.press(await screen.findByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Let it go' }));
    await waitFor(() => expect(history.at(-1)?.status).toBe('dismissed'), wait);
  });

  it('deleting the source entry keeps the step and drops the link', () => {
    const s = reducer(journal({}, { tomorrow: saved }), { type: 'deleteEntry', id: 'e1' });
    expect(s.tomorrow).toMatchObject({ text: STEP, status: 'open', source: undefined });
  });
});

describe('suggested steps from reviews', () => {
  const week = ['w1', 'w2', 'w3'].map((id, i) => entry(id, i % 3, { body: `Fictional entry ${id}.`, feelings: ['Tired'] }));
  const stored = {
    id: 'ins-1',
    created_at: '2026-10-21T12:00:00.000Z',
    period: 'week',
    entry_count: 3,
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    output: {
      enough_evidence: true,
      summary: 'Fictional summary.',
      observations: [{ kind: 'strength', title: 'Fictional calm', body: 'b', grounding: 'observed', entry_ids: ['w3'] }],
      next_steps: [{ text: 'Fictional: another short walk.', why: 'It helped once.', entry_ids: ['w3'] }],
    },
    sources: week.map((e) => ({ entry_id: e.id, written_at: e.date })),
  };

  it('an AI review’s step opens Tomorrow Bridge to review first instead of saving on tap', async () => {
    const outputs: AiOutputsRepo = { latestReview: async () => toReview(stored), reflections: async () => ({}), deleteReflection: async () => {}, deleteConversation: async () => {}, deleteAll: async () => {} };
    const { invoke } = await open({ ...initialState, onboarded: true, entries: week }, '/patterns', { outputs });
    await fireEvent.press(await screen.findByRole('button', { name: 'Save as tomorrow’s step' }, wait));
    expect(await screen.findByText('Suggested by AI in your review', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('step:none')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save my step' }));
    expect(await screen.findByText('step:Fictional: another short walk.|insights|open', {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a step from tag counts is labelled as such, not as AI', async () => {
    await open(journal(), '/tomorrow?suggestion=Fictional%20counted%20step&basis=tags&use=1');
    expect(await screen.findByText('From your Patterns', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Suggested by AI/)).toBeNull();
  });
});

describe('with cloud backup and between accounts', () => {
  beforeEach(() => AsyncStorage.clear());

  it('a saved step goes to the account through the existing sync, with its source entry', async () => {
    const cloud = fakeCloud();
    function Save() {
      const { dispatch } = useStore();
      useEffect(() => {
        // What Tomorrow Bridge dispatches on Save.
        dispatch({ type: 'tomorrow', step: newStep(STEP, { kind: 'reflection', entryId: 'e1' }) });
      }, [dispatch]);
      return null;
    }
    await renderPlain(
      <DemoStoreProvider initial={journal()} storage={memoryStorage()}>
        <CloudSync userId="user-a" repo={cloud.repo} baseStorage={memoryStorage()}>
          <Save />
        </CloudSync>
      </DemoStoreProvider>,
    );
    await waitFor(() => expect(Object.values(cloud.data('user-a').tomorrow)).toHaveLength(1), wait);
    expect(Object.values(cloud.data('user-a').tomorrow)[0]).toMatchObject({ text: STEP, source_kind: 'reflection', source_entry_id: 'e1' });
    expect(cloud.log.some((l) => l.changes.upserts.tomorrow.length === 1)).toBe(true);
  });

  it('account B never sees account A’s step', async () => {
    await scopedStorage('user:user-a').save(toSnapshot({ ...journal(), tomorrow: newStep(STEP, { kind: 'reflection', entryId: 'e1' }) }));
    let emit: (u: AuthUser | null) => void = () => {};
    const watchUser = (on: (u: AuthUser | null) => void) => {
      emit = on;
      on(null);
      return () => {};
    };
    function Journal() {
      const { scope, user, repo } = useSession();
      return (
        <DemoStoreProvider key={scope} storage={scopedStorage(scope)}>
          {scope !== 'guest' && user && repo ? (
            <CloudSync userId={user.id} repo={repo}>
              <StepRecorder />
            </CloudSync>
          ) : (
            <StepRecorder />
          )}
        </DemoStoreProvider>
      );
    }
    await renderPlain(
      <SessionProvider auth={{ signOut: async () => emit(null) } as unknown as AuthService} repo={fakeCloud().repo} watchUser={watchUser} settings={memoryStorage({ syncUsers: ['user-a', 'user-b'] })}>
        <Journal />
      </SessionProvider>,
    );
    await actPlain(async () => emit({ id: 'user-b', email: 'b@example.test' }));
    expect(await plainScreen.findByText('step:none', {}, wait)).toBeOnTheScreen();
    expect(plainScreen.queryByText(new RegExp(STEP))).toBeNull();
  });
});
