import { feedbackMailto, POLICY_URLS, SUPPORT_EMAIL, versionLabel } from '@/services/app-info';

describe('versionLabel', () => {
  it('shows the version and the first 7 characters of the update id', () => {
    expect(versionLabel({ version: '1.3.0', updateId: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', web: false })).toBe('Version 1.3.0 · update 1a2b3c4');
  });

  it('says built in when there is no update id', () => {
    expect(versionLabel({ version: '1.3.0', updateId: null, web: false })).toBe('Version 1.3.0 · built in');
  });

  it('shows only the version on the web', () => {
    expect(versionLabel({ version: '1.3.0', updateId: 'abcdef12-0000', web: true })).toBe('Version 1.3.0');
  });

  it('says so when the version is unknown', () => {
    expect(versionLabel({ version: null, updateId: null, web: true })).toBe('Version unknown');
    expect(versionLabel({ version: null, updateId: null, web: false })).toBe('Version unknown · built in');
  });
});

describe('feedbackMailto', () => {
  const url = feedbackMailto({ version: '1.3.0', updateId: null, platform: 'android', os: '14' });

  it('addresses the support email with the feedback subject', () => {
    expect(SUPPORT_EMAIL).toBe('aldrichgavriels@gmail.com');
    expect(url.startsWith('mailto:aldrichgavriels@gmail.com?subject=Kindway%20feedback&body=')).toBe(true);
  });

  it('adds app and platform details but no other address', () => {
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('App: 1.3.0');
    expect(body).toContain('Platform: android 14');
    expect(url.split('@')).toHaveLength(2);
    expect(body).not.toContain('@');
  });

  it('in the app, names the update', () => {
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Update: built in');
  });

  it('on the web, gives just the platform, with no update line or made-up OS version', () => {
    const web = feedbackMailto({ version: '1.3.0', updateId: null, platform: 'web', os: '0.0.0', web: true });
    const body = decodeURIComponent(web.split('&body=')[1]);
    expect(body).toContain('App: 1.3.0');
    expect(body.split('\n')).toContain('Platform: web');
    expect(body).not.toContain('Update:');
    expect(body).not.toContain('0.0.0');
  });
});

describe('POLICY_URLS', () => {
  it('points at the hosted pages', () => {
    expect(POLICY_URLS.privacy).toBe('https://kindway.pages.dev/privacy.html');
    expect(POLICY_URLS.terms).toBe('https://kindway.pages.dev/terms.html');
  });
});
