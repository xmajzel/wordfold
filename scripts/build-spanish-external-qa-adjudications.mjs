import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOURCES = [
  ['A1', '.artifacts/spanish-a1-quality-qa/findings.json'],
  ['A1', '.artifacts/spanish-a1-everyday-quality-qa/findings.json'],
  ['A1', '.artifacts/spanish-a1-minority-pos-quality-qa/findings.json'],
  ['A2', '.artifacts/spanish-a2-quality-qa/findings.json'],
  ['A2', '.artifacts/spanish-a2-minority-pos-quality-qa/findings.json'],
  ['A2', '.artifacts/spanish-a2-post-correction-quality-qa/findings.json'],
  ['B1', '.artifacts/spanish-b1-quality-qa/findings.json'],
];

const BUCKET_B = new Set(['es-cefr:48633185a64b2bd3', 'es-cefr:e92fb20d3f721556']);
const REPAIRS = new Map(Object.entries({
  'es-cefr:f4f75dae96dffdbb': {
    definition: 'Persona que atiende y ayuda a alguien que necesita cuidados.',
    example: 'El cuidador ayuda al anciano a vestirse cada mañana.',
  },
  'es-cefr:06465b9411e6582e': {
    definition: 'Deporte de equipo en el que se lanza una pelota con las manos para marcar goles.',
    example: 'Nuestro equipo de balonmano ganó el partido por dos goles.',
  },
  'es-cefr:dea1ef8f7223d58f': {
    definition: 'Bebida tradicional americana elaborada mediante la fermentación del maíz.',
    example: 'Sirvieron chicha de maíz durante la celebración.',
  },
  'es-cefr:7a6f17ad03a9ba8b': {
    example: 'La terminación diminutiva añade un matiz afectivo a la palabra.',
  },
  'es-cefr:f35e27206fcd4148': {
    definition: 'Hombre de aspecto atractivo.',
    example: 'El guapo de la película sonrió a la cámara.',
  },
  'es-cefr:eeba9691f45e7326': {
    definition: 'Reunión general de todos los miembros de una corporación o asamblea.',
    example: 'El pleno del ayuntamiento aprobó el presupuesto.',
  },
  'es-cefr:fd0d600bb7694f8d': {
    definition: 'Técnica gimnástica realizada con música y control del ritmo respiratorio.',
    example: 'Mi madre practica aeróbic con música tres veces por semana.',
  },
  'es-cefr:821058c18a3ff7a0': {
    definition: 'Insignia o adorno pequeño que se lleva prendido en la ropa.',
    example: 'Llevaba un pin azul en la chaqueta.',
  },
  'es-cefr:df21f1cbc03a1087': {
    definition: 'Persona de origen hispanoamericano, especialmente la que vive en Estados Unidos.',
    example: 'El hispano mantiene vínculos con la cultura de su familia.',
  },
  'es-cefr:c1148869147f0576': {
    definition: 'Conjunto de principios sobre lo correcto y lo incorrecto que guía la conducta.',
  },
}));

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

export function buildAdjudications() {
  const byId = new Map();
  const sourceRuns = [];
  for (const [level, relativePath] of SOURCES) {
    const path = resolve(relativePath);
    const text = readFileSync(path);
    const findings = JSON.parse(text);
    sourceRuns.push({ level, path, sha256: sha256(text) });
    for (const finding of findings.externalNonCorrespondence) {
      const current = byId.get(finding.entryId) ?? { ...finding, level, sourceRuns: [] };
      if (current.level !== level || current.term !== finding.term || current.partOfSpeech !== finding.partOfSpeech) {
        throw new Error(`${finding.entryId}: inconsistent duplicate finding.`);
      }
      current.sourceRuns.push(path);
      current.categories = [...new Set([...(current.categories ?? []), ...(finding.categories ?? [])])].sort();
      byId.set(finding.entryId, current);
    }
  }
  const entries = [...byId.values()].map((finding) => {
    const repair = REPAIRS.get(finding.entryId);
    const bucket = repair ? 'A' : BUCKET_B.has(finding.entryId) ? 'B' : 'R';
    return {
      entryId: finding.entryId,
      term: finding.term,
      partOfSpeech: finding.partOfSpeech,
      level: finding.level,
      bucket,
      decision: bucket === 'A' ? 'repair-content' : bucket === 'B' ? 'semantic-exception' : 'reference-miss-no-content-change',
      semanticException: bucket === 'B',
      staleSlovakHint: bucket === 'A' && ['A1', 'A2'].includes(finding.level),
      replacementDefinition: repair?.definition ?? null,
      replacementExample: repair?.example ?? null,
      sourceRuns: finding.sourceRuns,
      categories: finding.categories,
      externalRationale: finding.rationale,
    };
  }).sort((left, right) => ['A1', 'A2', 'B1'].indexOf(left.level) - ['A1', 'A2', 'B1'].indexOf(right.level)
    || left.term.localeCompare(right.term, 'es'));
  const countsByLevel = Object.fromEntries(['A1', 'A2', 'B1'].map((level) => {
    const subset = entries.filter((entry) => entry.level === level);
    return [level, {
      uniqueFindings: subset.length,
      bucketA: subset.filter((entry) => entry.bucket === 'A').length,
      bucketB: subset.filter((entry) => entry.bucket === 'B').length,
      bucketR: subset.filter((entry) => entry.bucket === 'R').length,
    }];
  }));
  const totals = Object.values(countsByLevel).reduce((sum, value) => ({
    uniqueFindings: sum.uniqueFindings + value.uniqueFindings,
    bucketA: sum.bucketA + value.bucketA,
    bucketB: sum.bucketB + value.bucketB,
    bucketR: sum.bucketR + value.bucketR,
  }), { uniqueFindings: 0, bucketA: 0, bucketB: 0, bucketR: 0 });
  if (JSON.stringify(totals) !== JSON.stringify({ uniqueFindings: 63, bucketA: 10, bucketB: 2, bucketR: 51 })) {
    throw new Error(`Unexpected adjudication totals: ${JSON.stringify(totals)}.`);
  }
  return {
    schemaVersion: 1,
    notHumanReview: true,
    courseId: 'es-sk',
    policy: {
      bucketA: 'Wrong learner-facing Spanish definition or example. Apply the replacement overlay without regenerating unaffected content.',
      bucketB: 'Correct Spanish content that intentionally rejects the attributed OMW sense. Only solar and querido are semantic exceptions.',
      bucketR: 'Correct Spanish content and supported selected OMW record; the external-reference failure is a Wiktionary coverage or sense-granularity miss.',
      reporting: 'Always report A/B/R alongside external correspondence; never present a raw external non-correspondence rate on its own.',
    },
    sourceRuns,
    countsByLevel,
    totals,
    entries,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const outputPath = resolve('assets/catalog/spanish/external-qa-adjudications.json');
  const result = buildAdjudications();
  writeJsonAtomic(outputPath, result);
  console.log(canonicalJson({ outputPath, countsByLevel: result.countsByLevel, totals: result.totals }));
}
