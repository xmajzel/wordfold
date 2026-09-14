import { renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSpanishCourseBase } from './build-spanish-course-base.mjs';
import { appendSpanishC2Release } from './release-spanish-c2.mjs';

export function buildSpanishCourse() {
  return appendSpanishC2Release(buildSpanishCourseBase());
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const catalog = buildSpanishCourse();
  const path = 'assets/catalog/spanish/course.json';
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`);
  renameSync(temporaryPath, path);
  console.log(JSON.stringify({ path, counts: catalog.counts, excludedConcepts: catalog.excludedConcepts.length }));
}
