import { transformFileSync } from '@babel/core';

import { renderKindwayWidget } from '@/widget/task-handler';
import { KindwayWidget } from '@/widget/kindway-widget';

// react-native-android-widget calls widget components as plain functions, outside React's
// renderer, so any hook makes the widget fail to draw and stay blank on the home screen. The
// React Compiler (on for the app, applied by Metro but not by Jest) adds a memo-cache hook to
// every component unless it opts out, which left 1.2.0's first build blank (2026-10-26).
describe('the home-screen widget', () => {
  it('opts out of the React Compiler, so it never calls a hook', () => {
    const out = transformFileSync('src/widget/kindway-widget.tsx', {
      babelrc: false,
      configFile: false,
      presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
      plugins: ['babel-plugin-react-compiler'],
    });
    expect(out?.code).not.toMatch(/compiler-runtime/);
  });

  it('can be called as a plain function, in both schemes', () => {
    expect(() => KindwayWidget({ prompt: 'Fictional prompt', step: null, stepDue: null, scheme: 'light' })).not.toThrow();
    expect(() => KindwayWidget({ prompt: 'Fictional prompt', step: 'Fictional step', stepDue: 'today', scheme: 'night' })).not.toThrow();
  });

  it('describes a light and a dark version', async () => {
    const out = await renderKindwayWidget();
    expect(out.light).toBeTruthy();
    expect(out.dark).toBeTruthy();
  });
});
