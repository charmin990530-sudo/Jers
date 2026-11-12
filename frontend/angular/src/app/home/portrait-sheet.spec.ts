import { PortraitSheet } from './portrait-sheet';

describe('PortraitSheet', () => {
    it('mantiene los vértices ordenados incluso con tirones extremos', () => {
        const sheet = new PortraitSheet();
        sheet.grab(.51, .6); sheet.pull(8, -5);
        for (let frame = 0; frame < 60; frame++) sheet.update(1 / 30);
        const gap = sheet.span * .34 - .000002;
        for (let j = 0; j < sheet.m; j++) for (let i = 0; i < sheet.m; i++) {
            const k = j * sheet.m + i;
            expect(Number.isFinite(sheet.dynamic[k * 3])).toBeTrue();
            expect(Number.isFinite(sheet.dynamic[k * 3 + 1])).toBeTrue();
            if (i < sheet.n) {
                const dx = sheet.rest[(k + 1) * 2] + sheet.dynamic[(k + 1) * 3] - sheet.rest[k * 2] - sheet.dynamic[k * 3];
                expect(dx).toBeGreaterThanOrEqual(gap);
            }
            if (j < sheet.n) {
                const dy = sheet.rest[(k + sheet.m) * 2 + 1] + sheet.dynamic[(k + sheet.m) * 3 + 1] - sheet.rest[k * 2 + 1] - sheet.dynamic[k * 3 + 1];
                expect(dy).toBeGreaterThanOrEqual(gap);
            }
        }
    });

    it('conserva la simulación al cambiar entre 30 y 120 FPS', () => {
        const slow = new PortraitSheet(), fast = new PortraitSheet();
        for (const sheet of [slow, fast]) { sheet.grab(.5, .5); sheet.pull(.68, .55); }
        for (let frame = 0; frame < 30; frame++) slow.update(1 / 30);
        for (let frame = 0; frame < 120; frame++) fast.update(1 / 120);
        let difference = 0;
        for (let k = 0; k < slow.dynamic.length; k++) difference = Math.max(difference, Math.abs(slow.dynamic[k] - fast.dynamic[k]));
        expect(difference).toBeLessThan(.003);
    });

    it('regresa a reposo al soltar y reinicia sin deformaciones al pausar', () => {
        const sheet = new PortraitSheet();
        sheet.grab(.5, .5); sheet.pull(.8, .5);
        for (let frame = 0; frame < 30; frame++) sheet.update(1 / 60);
        expect(Math.max(...sheet.dynamic.filter((_, i) => i % 3 === 0))).toBeGreaterThan(.02);
        sheet.release();
        for (let frame = 0; frame < 240; frame++) sheet.update(1 / 60);
        expect(Math.max(...sheet.dynamic.filter((_, i) => i % 3 === 0))).toBeLessThan(.01);
        sheet.reset();
        expect(sheet.dynamic.every((value, i) => value === (i % 3 === 2 ? 1 : 0))).toBeTrue();
    });
});
