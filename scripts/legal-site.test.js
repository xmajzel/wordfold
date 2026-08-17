const fs = require('node:fs');
const path = require('node:path');

describe('public legal site', () => {
  const root = path.resolve(__dirname, '..', 'site');
  const privacy = fs.readFileSync(path.join(root, 'privacy', 'index.html'), 'utf8');
  const deletion = fs.readFileSync(path.join(root, 'account-deletion', 'index.html'), 'utf8');

  it('publishes the approved contact and no placeholders', () => {
    expect(privacy).toContain('support@wordfold.app');
    expect(deletion).toContain('support@wordfold.app');
    expect(`${privacy}${deletion}`).not.toMatch(/example\.com|TODO|replace-with/i);
  });

  it('describes both in-app and external account deletion', () => {
    expect(deletion).toContain('Delete inside the app');
    expect(deletion).toContain('Request deletion without the app');
    expect(deletion).toContain('local vocabulary copy');
    expect(deletion).toContain('Google Play lifetime purchase is not deleted');
  });
});
