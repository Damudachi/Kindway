import { AiConsentDialog, type ConsentBlocker } from '@/components/ai-consent-dialog';

type Props = {
  /** Why real AI can't reply right now; null hides the dialog. */
  blocker: ConsentBlocker | null;
  onCancel: () => void;
  /** Called once follow-up consent is recorded on the account. */
  onAllowed: () => void;
  onGrantFailed: () => void;
};

/**
 * Asked before the first message in a follow-up conversation that can't get a real AI reply:
 * either for follow-up consent, or for the account or cloud backup that consent needs.
 */
export function FollowUpConsentDialog(props: Props) {
  return <AiConsentDialog scope="follow_up" {...props} />;
}
