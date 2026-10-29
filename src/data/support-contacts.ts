/**
 * Who to contact for help, for the Philippines (where Kindway's beta users are). Only contacts
 * confirmed on an official source on the day are listed; each records that source and the date it
 * was checked. Re-check every number before a wider release, and add a region before showing this
 * list anywhere else.
 *
 * Left out on 2026-10-29: Hopeline PH and In Touch Community Services. Their numbers appear in
 * news and guides, but couldn't be confirmed on their own sites that day.
 */
export type SupportLine = { label: string; number: string };

export type SupportContact = {
  name: string;
  purpose: string;
  hours: string;
  calls: SupportLine[];
  texts?: SupportLine[];
  /** The official page the numbers were checked against. */
  source: string;
  /** When they were checked, YYYY-MM-DD. */
  checked: string;
};

export const EMERGENCY_NUMBER = '911';

export const SUPPORT_CONTACTS: SupportContact[] = [
  {
    name: 'Emergency 911',
    purpose: 'Police, fire, ambulance and rescue, anywhere in the Philippines.',
    hours: '24 hours, free to call',
    calls: [{ label: 'Call 911', number: '911' }],
    // DILG runs the national 911 hotline.
    source: 'https://calabarzon.dilg.gov.ph/911-becomes-filipinos-lifeline-as-emergency-calls-top-5-2-million-in-early-2026/',
    checked: '2026-10-29',
  },
  {
    name: 'NCMH Crisis Hotline',
    purpose: 'The National Center for Mental Health’s crisis line. Someone will listen if you’re struggling or thinking about suicide.',
    hours: '24 hours, every day',
    // Mobile numbers first: both beta users call from mobile phones. DOH pages describe 1553 as a
    // toll-free landline number, and Philippine 1800 numbers are usually landline toll-free too.
    calls: [
      { label: 'Call 0919-057-1553 (Smart/TNT)', number: '0919-057-1553' },
      { label: 'Call 0917-899-8727 (Globe/TM)', number: '0917-899-8727' },
      { label: 'Call 0966-351-4518 (Globe/TM)', number: '0966-351-4518' },
      { label: 'Call 1553 (landline)', number: '1553' },
      { label: 'Call 1800-1888-1553 (toll-free)', number: '1800-1888-1553' },
    ],
    // NCMH's own contact page. It blocks automated access, so it was read from a search index's
    // copy; DOH's Bataan and Cordillera pages confirm 1553 and the 24/7 hours.
    source: 'https://ncmh.gov.ph/contact-us/',
    checked: '2026-10-29',
  },
];
