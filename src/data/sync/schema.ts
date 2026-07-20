import { column, Schema, Table } from '@powersync/react-native';

const collections = new Table({
  user_id: column.text,
  name: column.text,
  color: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const words = new Table({
  user_id: column.text,
  collection_id: column.text,
  term: column.text,
  normalized_term: column.text,
  source_language_code: column.text,
  target_language_code: column.text,
  part_of_speech: column.text,
  definition: column.text,
  example: column.text,
  translation: column.text,
  catalog_sense_id: column.text,
  cefr_level: column.text,
  source: column.text,
  state: column.text,
  understood_streak: column.integer,
  lapse_count: column.integer,
  view_count: column.integer,
  last_viewed_at: column.text,
  last_rated_at: column.text,
  next_review_at: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
}, { indexes: { collection: ['collection_id'], due: ['state', 'next_review_at'] } });

const learningEvents = new Table({
  user_id: column.text,
  word_id: column.text,
  type: column.text,
  value: column.text,
  occurred_at: column.text,
}, { indexes: { occurred: ['occurred_at'], word: ['word_id'] } });

export const syncSchema = new Schema({
  collections,
  words,
  learning_events: learningEvents,
});

export type SyncDatabase = (typeof syncSchema)['types'];
