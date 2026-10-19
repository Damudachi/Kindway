import type { ChatMessage, SupportStyle } from '@/data/types';

import type { FollowUpRequest } from './types';

/** Pre-written replies by style. The user's message is not interpreted; replies rotate in order. */
const REPLIES: Record<Exclude<SupportStyle, 'ask'>, string[]> = {
  listen: [
    'Thank you for saying that. Keep going if there’s more.',
    'That’s here now, written down. You don’t need to do anything with it.',
    'We can leave it there for tonight if you like.',
  ],
  understand: [
    'Thank you for saying that. What part of it feels most true right now?',
    'What do you think was underneath that feeling?',
    'Is there anything about this you’d like to understand better before you rest?',
  ],
  honest: [
    'Thank you for saying that. Is there another way someone who cares about you might see it?',
    'If a friend told you this, what would you want them to hear?',
    'What would you need to see to believe a kinder version of this?',
  ],
  forward: [
    'Thank you for saying that. Is there one small thing that would help, even a little?',
    'Rest is a reasonable choice too. What would make tomorrow feel a bit lighter?',
    'We can stop here. Nothing has to be decided tonight.',
  ],
};

export function mockFollowUp(req: FollowUpRequest): ChatMessage {
  const style = req.style === 'ask' ? 'understand' : req.style;
  const asked = req.messages.filter((m) => m.from === 'me').length;
  const replies = REPLIES[style];
  return { id: `k${Date.now()}`, from: 'kindway', text: replies[(asked - 1 + replies.length) % replies.length] };
}
