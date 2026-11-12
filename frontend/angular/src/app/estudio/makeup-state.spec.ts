import { LOOK_KEY, MakeupLook, parseLook, RULES, saveLook, stepMatches } from './makeup-state';

describe('Capas y retos del estudio de maquillaje', () => {
  it('sustituye una categoría sin duplicar capas y conserva las demás', () => {
    const look = new MakeupLook();
    look.addOption({ category: 'labios', shade: 'nude', intensity: 30 });
    look.addOption({ category: 'rubor', shade: 'rose', intensity: 25 });
    look.addOption({ category: 'labios', shade: 'berry', intensity: 70 });
    expect(look.options.length).toBe(2); expect(look.hasOption('labios', 'berry')).toBeTrue();
    expect(look.hasOption('labios', 'nude')).toBeFalse();
  });
  it('deshace aplicación, retirada y reinicio sin perder la combinación anterior', () => {
    const look = new MakeupLook();
    look.addOption({ category: 'labios', shade: 'nude', intensity: 40 });
    look.addOption({ category: 'rubor', shade: 'rose', intensity: 20 });
    look.removeOption('labios'); look.undo(); expect(look.options.length).toBe(2);
    look.reset(); expect(look.options.length).toBe(0);
    look.undo(); expect(look.options.length).toBe(2);
    look.undo(); expect(look.options.length).toBe(1);
  });
  it('un mismo valor no consume el historial de deshacer', () => {
    const look = new MakeupLook(); const option = { category: 'labios' as const, shade: 'nude', intensity: 40 };
    look.addOption(option); expect(look.addOption(option)).toBeFalse();
    look.undo(); expect(look.options).toEqual([]); expect(look.canUndo).toBeFalse();
  });
  it('valida y recupera solamente el esquema local conocido, sin URLs externas', () => {
    const look = new MakeupLook(); look.addOption({ category: 'labios', shade: 'nude', intensity: 40 });
    const json = JSON.stringify(look.toJSON('natural'));
    expect(parseLook(json)?.options).toEqual(look.options);
    for (const invalid of [
      '{broken', JSON.stringify({ version: 2, mode: 'libre', options: [] }),
      JSON.stringify({ version: 1, mode: 'libre', options: [{ category: 'labios', shade: 'https://other.example/a.png', intensity: 40 }] }),
      JSON.stringify({ version: 1, mode: 'libre', options: [{ category: 'labios', shade: 'nude', intensity: 400 }] }),
      JSON.stringify({ version: 1, mode: 'libre', options: [...look.options, ...look.options] }),
      JSON.stringify({ version: 1, mode: 'libre', options: [], won: true }),
      ' '.repeat(3000),
    ]) expect(parseLook(invalid)).toBeNull();
  });
  it('un almacenamiento bloqueado no impide seguir jugando', () => {
    const look = new MakeupLook();
    const storage = { setItem: () => { throw new DOMException('Blocked'); } };
    expect(saveLook(storage, look.toJSON('libre'))).toBeFalse();
    expect(look.addOption({ category: 'rubor', shade: 'rose', intensity: 30 })).toBeTrue();
  });
  it('guarda opciones tipadas y nunca una imagen, sesión o premio', () => {
    const storage = jasmine.createSpyObj('Storage', ['setItem']); const look = new MakeupLook();
    expect(saveLook(storage, look.toJSON('libre'))).toBeTrue();
    expect(storage.setItem).toHaveBeenCalledWith(LOOK_KEY, '{"version":1,"mode":"libre","options":[]}');
  });
  it('los tres retos se completan por paleta e intensidad y una capa incorrecta deja el paso pendiente', () => {
    for (const challenge of RULES.challenges) {
      const options = challenge.steps.map(step => ({ category: step.category, shade: step.shades[0], intensity: Math.round((step.min + step.max) / 2) }));
      expect(challenge.steps.every(step => stepMatches(step, options))).toBeTrue();
      options[0].intensity = 1;
      expect(stepMatches(challenge.steps[0], options)).toBeFalse();
    }
  });
  it('rechaza un color de otra herramienta y mantiene el estado inmutable al serializar', () => {
    const look = new MakeupLook(); expect(look.addOption({ category: 'labios', shade: 'ink', intensity: 40 })).toBeFalse();
    look.addOption({ category: 'labios', shade: 'nude', intensity: 40 });
    const saved = look.toJSON('libre'); saved.options[0].intensity = 80;
    expect(look.options[0].intensity).toBe(40);
  });
});
