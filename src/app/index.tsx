import { Redirect } from 'expo-router';

import { useStore } from '@/state/demo-store';

export default function Index() {
  const { state } = useStore();
  return <Redirect href={state.onboarded ? '/today' : '/welcome'} />;
}
