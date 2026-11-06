// Envía las encuestas de seed/*.json al backend (POST /api/surveys).
// Si ya existe una encuesta con el mismo título: la deja igual si no cambió,
// o la reemplaza (PUT) si cambió. Uso: npm run seed [-- archivo.json ...]
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const API = process.env.SEED_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
const KEY = process.env.ADMIN_API_KEY;
if (!KEY) throw new Error('Falta ADMIN_API_KEY');

const request = async (method, url, body) => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-key': KEY },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(data?.message ?? data)}`);
  return data;
};

// Compara solo lo que define la encuesta (ignora _id, fechas, etc.).
const shape = (s) =>
  JSON.stringify({
    description: s.description ?? null,
    questions: s.questions.map((q) => ({
      text: q.text,
      type: q.type,
      options: (q.options ?? []).map(({ value, label }) => ({ value, label })),
      min: q.min ?? null,
      max: q.max ?? null,
    })),
  });

const seedDir = path.resolve(import.meta.dirname, '../seed');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(seedDir)).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(seedDir, f));

const existing = await request('GET', '/surveys');

for (const file of files) {
  const survey = JSON.parse(await readFile(file, 'utf8'));
  const found = existing.find((s) => s.title === survey.title);
  if (!found) {
    const created = await request('POST', '/surveys', survey);
    console.log(`+ creada    ${created._id}  ${survey.title} (${survey.questions.length} preguntas)`);
  } else if (shape(found) === shape(survey)) {
    console.log(`= sin cambios ${found._id}  ${survey.title}`);
  } else {
    await request('PUT', `/surveys/${found._id}`, survey);
    console.log(`~ reemplazada ${found._id}  ${survey.title}`);
  }
}
