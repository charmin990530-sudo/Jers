/**
 * Adapted from Doll / Option in wolfderechter/DollMaker js/canvas.js,
 * commit 4fd5adcf48640e238401bb2b4dd75c3702be644c (MIT, Copyright 2024 wolfderechter).
 * Category replacement, ordered layers and serialization are retained;
 * validation, undo and challenge evaluation are original By Jers additions.
 * Full notice: /licenses/dollmaker.txt and THIRD_PARTY_NOTICES.md.
 */
import source from '../../../../../shared/makeup-rules.json';

export type CategoryId = 'labios' | 'sombras' | 'rubor' | 'delineado';
export type ModeId = 'libre' | 'natural' | 'noche' | 'editorial';
export interface MakeupOption { category: CategoryId; shade: string; intensity: number; }
export interface MakeupStep { category: CategoryId; shades: string[]; min: number; max: number; instruction: string; }
export interface Challenge { id: ModeId; name: string; subtitle: string; description: string; steps: MakeupStep[]; }
interface Rules {
  version: number;
  categories: { id: CategoryId; name: string; hint: string; shades: string[] }[];
  shades: { id: string; name: string; hex: string }[];
  challenges: Challenge[];
}
export const RULES = source as Rules;
export const LOOK_KEY = 'by-jers.studio.look.v1';
export interface SavedLook { version: 1; mode: ModeId; options: MakeupOption[]; }

export function validOption(value: unknown): value is MakeupOption {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'category,intensity,shade') return false;
  return RULES.categories.some(c => c.id === v['category'] && c.shades.includes(String(v['shade'])))
    && typeof v['shade'] === 'string' && typeof v['intensity'] === 'number'
    && Number.isInteger(v['intensity']) && v['intensity'] >= 1 && v['intensity'] <= 100;
}

export function parseLook(value: string): SavedLook | null {
  if (value.length > 2048) return null;
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const v = data as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'mode,options,version' || v['version'] !== 1) return null;
    if (!['libre', ...RULES.challenges.map(c => c.id)].includes(String(v['mode']))) return null;
    if (!Array.isArray(v['options']) || v['options'].length > 4 || !v['options'].every(validOption)) return null;
    const options = v['options'] as MakeupOption[];
    if (new Set(options.map(o => o.category)).size !== options.length) return null;
    return { version: 1, mode: v['mode'] as ModeId, options: options.map(o => ({ ...o })) };
  } catch { return null; }
}

export class MakeupLook {
  options: MakeupOption[] = [];
  private history: MakeupOption[][] = [];
  get canUndo(): boolean { return this.history.length > 0; }
  private remember(): void {
    this.history.push(this.options.map(option => ({ ...option })));
    if (this.history.length > 30) this.history.shift();
  }
  hasOption(category: CategoryId, shade: string): boolean {
    return this.options.some(option => option.category === category && option.shade === shade);
  }
  // Backwards splice follows Doll.removeAllOptionsFromCategory from upstream.
  private removeAllOptionsFromCategory(category: CategoryId): void {
    let i = this.options.length;
    while (i--) if (this.options[i].category === category) this.options.splice(i, 1);
  }
  addOption(option: MakeupOption): boolean {
    if (!validOption(option)) return false;
    const previous = this.options.find(o => o.category === option.category);
    if (previous?.shade === option.shade && previous.intensity === option.intensity) return false;
    this.remember(); this.removeAllOptionsFromCategory(option.category);
    this.options.push({ ...option });
    return true;
  }
  removeOption(category: CategoryId): boolean {
    if (!this.options.some(o => o.category === category)) return false;
    this.remember(); this.removeAllOptionsFromCategory(category); return true;
  }
  undo(): void { const previous = this.history.pop(); if (previous) this.options = previous; }
  reset(): void { if (this.options.length) { this.remember(); this.options = []; } }
  restore(look: SavedLook): void { this.options = look.options.map(o => ({ ...o })); this.history = []; }
  toJSON(mode: ModeId): SavedLook { return { version: 1, mode, options: this.options.map(o => ({ ...o })) }; }
}

export function stepMatches(step: MakeupStep, options: MakeupOption[]): boolean {
  const option = options.find(o => o.category === step.category);
  return !!option && step.shades.includes(option.shade) && option.intensity >= step.min && option.intensity <= step.max;
}

export function saveLook(storage: Pick<Storage, 'setItem'>, look: SavedLook): boolean {
  try { storage.setItem(LOOK_KEY, JSON.stringify(look)); return true; } catch { return false; }
}
