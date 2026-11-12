import fs from 'node:fs';
import { z } from 'zod';

export const makeupRules = JSON.parse(fs.readFileSync(new URL('../../../shared/makeup-rules.json', import.meta.url), 'utf8'));
export const categoryIds = makeupRules.categories.map(c => c.id);
export const challengeIds = ['libre', ...makeupRules.challenges.map(c => c.id)];
export const categorySchema = z.enum(categoryIds);
export const optionSchema = z.object({
  category: categorySchema,
  shade: z.enum(makeupRules.shades.map(s => s.id)),
  intensity: z.number().int().min(1).max(100),
}).strict().refine(option => makeupRules.categories.find(c => c.id === option.category).shades.includes(option.shade), 'Ese color no pertenece a la herramienta.');
export const stepMatches = (challengeId, option) => {
  const step = makeupRules.challenges.find(c => c.id === challengeId)?.steps.find(s => s.category === option.category);
  return Boolean(step && step.shades.includes(option.shade) && option.intensity >= step.min && option.intensity <= step.max);
};

export const rewardRules = Object.freeze({
  'play-lips': { name: '10% en labiales por jugar', percent: 10, scope: 'labiales', minimumExclusive: 0 },
  'win-store': { name: '10% en toda la tienda por ganar', percent: 10, scope: 'tienda', minimumExclusive: 150000 },
});

// Mapeo explícito por nombre de producto: los gloss y delineadores de labios
// no se anuncian como labiales ni reciben su descuento por pertenecer a labios.
export const cosmeticType = product => {
  const name = String(product?.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^labial(?:es)?\b/.test(name)) return 'labios';
  if (/\bsombras?\b/.test(name)) return 'sombras';
  if (/\brubor\b/.test(name)) return 'rubor';
  if (/\bdelineador\b/.test(name) && !/\blabios?\b/.test(name)) return 'delineado';
  return null;
};
