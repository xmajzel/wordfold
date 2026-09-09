import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPAIRS = new Map(Object.entries({
  'peluquería': { definition: 'Establecimiento donde se corta, peina y cuida el cabello.' },
  'solar': { definition: 'Cubrir un suelo con baldosas, madera u otro material.', example: 'Van a solar la cocina con baldosas nuevas.', semanticException: true },
  'sacrificio': { definition: 'Ofrenda o acto ritual realizado en honor de una divinidad.' },
  'querido': { definition: 'Persona con la que alguien mantiene una relación amorosa.', example: 'Se encontró con su querido lejos de la ciudad.', semanticException: true },
  'maravillar': { definition: 'Causar gran admiración o sorpresa.', staleSlovakHint: true },
  'media': { definition: 'Resultado de sumar varios valores y dividir la suma entre su número.' },
  'recado': { definition: 'Tarea breve que se hace fuera de casa, como comprar, llevar o recoger algo.' },
  'contaminación': { definition: 'Presencia o introducción de agentes perjudiciales en el medio ambiente.' },
  'lleno': { definition: 'Situación en la que un lugar alcanza toda o casi toda su capacidad.', example: 'Hubo un lleno total en el teatro.', staleSlovakHint: true },
  'confirmar': { example: 'Los análisis confirmaron que el agua era potable.' },
  'barroco': { definition: 'Perteneciente a un estilo artístico caracterizado por una ornamentación abundante y elaborada.' },
  'contentar': { definition: 'Hacer que alguien se sienta satisfecho o feliz.' },
  'manager': { definition: 'Persona que dirige o administra el trabajo o la carrera de otras personas.' },
  'millonario': { definition: 'Persona que posee una fortuna de un millón o más de unidades monetarias, o que es muy rica.' },
  'comunitario': { definition: 'Relacionado con una comunidad o destinado a sus miembros.' },
  'cuerda': { definition: 'Conjunto largo, fuerte y flexible de fibras o hilos unidos.' },
  'videojuego': { definition: 'Juego electrónico que se utiliza en una pantalla mediante una consola, ordenador u otro dispositivo.' },
  'disfraz': { definition: 'Ropa y accesorios usados para parecer otra persona, personaje o cosa.' },
  'vacío': { example: 'Queda un vacío entre la pared y el armario.' },
  'electrodoméstico': { definition: 'Aparato eléctrico utilizado para realizar tareas domésticas.' },
  'decadencia': { example: 'La empresa entró en decadencia después de años de éxito.' },
  'telefonía': { definition: 'Sistema y servicio de comunicación a distancia mediante teléfonos.' },
  'web': { example: 'La web conecta páginas y contenidos de todo el mundo.' },
}));

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

export function buildCorrections(manifest, findings, generatedById, sourceSummarySha256) {
  if (findings.aiMaterialOrSenseDisagreement.length !== 23) throw new Error('Expected 23 unique A2 content findings.');
  const entries = findings.aiMaterialOrSenseDisagreement.map((finding) => {
    const repair = REPAIRS.get(finding.term);
    const generated = generatedById.get(finding.entryId);
    if (!repair || !generated) throw new Error(`${finding.entryId}: missing repair or generated content.`);
    const semanticException = Boolean(repair.semanticException);
    return {
      entryId: finding.entryId,
      term: finding.term,
      partOfSpeech: finding.partOfSpeech,
      decision: 'repair',
      originalMeaningReferenceSenseId: generated.meaningReferenceSenseId,
      selectedSenseDisposition: semanticException ? 'rejected-after-owner-risk-acceptance' : 'retained',
      semanticException,
      replacementDefinition: repair.definition ?? null,
      replacementExample: repair.example ?? null,
      staleSlovakHint: semanticException || Boolean(repair.staleSlovakHint),
      rationale: finding.rationale,
    };
  });
  return {
    schemaVersion: 1,
    notHumanReview: true,
    courseId: 'es-sk',
    level: 'A2',
    sourceRunIdentitySha256: manifest.runIdentitySha256,
    sourceContentSha256: '25da85d0a9942771fbab766f4aa47470b6e1a910a21fbd05956d25077e9a23b4',
    sourceAiSummarySha256: sourceSummarySha256,
    policy: 'Corrections overlay the immutable generated run. They are AI-assisted owner adjudications, not human or native-speaker review. Semantic exceptions explicitly reject an unsupported OMW selection instead of attributing the replacement meaning to that synset.',
    counts: { uniqueContentFindings: 23, wrongSense: 4, materialDefinition: 19, materialExample: 7, semanticExceptions: 2, staleSlovakHints: 4 },
    postCorrectionGate: 'Replacement content must pass the same external-reference correspondence check before a distributable A2 compiler may consume this sidecar.',
    entries,
  };
}

function run() {
  const manifestPath = resolve('.artifacts/spanish-a2-learner-content/full/manifest.json');
  const findingsPath = resolve('.artifacts/spanish-a2-quality-qa/findings.json');
  const summaryPath = resolve('.artifacts/spanish-a2-quality-qa/ai-cross-review-summary.json');
  const outputPath = resolve('assets/catalog/spanish/a2-ai-cross-review-adjudications.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const findings = JSON.parse(readFileSync(findingsPath, 'utf8'));
  const generatedById = new Map();
  for (const batch of manifest.batches) {
    for (const entry of JSON.parse(readFileSync(batch.outputPath, 'utf8'))) generatedById.set(entry.entryId, entry);
  }
  const result = buildCorrections(manifest, findings, generatedById, sha256(readFileSync(summaryPath)));
  writeJsonAtomic(outputPath, result);
  console.log(canonicalJson({ outputPath, counts: result.counts }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) run();
