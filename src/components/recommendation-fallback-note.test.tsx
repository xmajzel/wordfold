import { render } from '@testing-library/react-native';
import { RecommendationFallbackNote } from './recommendation-fallback-note';
import { buildRecommendations } from '@/features/recommendations/selector';

it('identifies a mixed set without describing all words as topic matches', async () => {
  const recommendations = buildRecommendations({ levels: ['A1'], topics: ['business'] }, [], 3);
  const mixed = recommendations.map((item, index) => ({ ...item, topic: index === 0 ? null : item.topic }));
  const screen = await render(<RecommendationFallbackNote recommendations={mixed}/>);
  screen.getByText('Includes 1 general vocabulary word at your selected levels to complete the set.');
});

it('explains a completely general set and stays absent for empty or fully matched sets', async () => {
  const recommendations = buildRecommendations({ levels: ['A1'], topics: ['business'] }, [], 3);
  const screen = await render(<RecommendationFallbackNote recommendations={recommendations.map((item) => ({ ...item, topic: null }))}/>);
  screen.getByText('No unused topic matches remain at your selected levels. This set uses general vocabulary.');
  await screen.rerender(<RecommendationFallbackNote recommendations={recommendations}/>);
  expect(screen.toJSON()).toBeNull();
  await screen.rerender(<RecommendationFallbackNote recommendations={[]}/>);
  expect(screen.toJSON()).toBeNull();
});
