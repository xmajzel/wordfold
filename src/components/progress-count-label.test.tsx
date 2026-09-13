import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ProgressCountLabel } from './progress-count-label';

describe('inline progress count-label unit', () => {
  it('renders the zero count and its entire label together', async () => {
    const screen = await render(<ProgressCountLabel value={0} label="Known"/>);
    expect(screen.getByText('0 Known')).toBeTruthy();
    expect(screen.queryByText('Known', { exact: true })).toBeNull();
  });

  it('keeps a grouped large count and multiword label unbroken without line limits', async () => {
    const screen = await render(<ProgressCountLabel value={8300} label="Added, not started"/>);
    const pair = screen.getByText(`${(8300).toLocaleString().replace(/\s/gu, '\u00a0')}\u00a0Added,\u00a0not\u00a0started`, { normalizer: (text) => text });
    expect(pair.props.numberOfLines).toBeUndefined();
    expect(pair.props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('reserves the emphasized count line height within the caption line', async () => {
    const screen = await render(<ProgressCountLabel value={8300} label="Not started" emphasizeValue/>);
    const pair = screen.getByText('8,300 Not started');
    expect(StyleSheet.flatten(pair.props.style).lineHeight).toBe(20);
  });
});
