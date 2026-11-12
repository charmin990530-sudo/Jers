import { expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';

test('el proceso de pruebas impide el envenenamiento del prototipo mediante deepmerge', () => {
  const script = `const merge=require('deepmerge');
    const target=JSON.parse('{"__proto__":{}}');
    const source=JSON.parse('{"__proto__":{"elevated":true}}');
    const result=merge(target,source);
    if(Object.getPrototypeOf(result)!==Object.prototype||result.elevated!==undefined)process.exit(1);
    console.log('protected');`;
  expect(execFileSync(process.execPath, ['--disable-proto=delete', '-e', script], { encoding: 'utf8', timeout: 5000 }).trim()).toBe('protected');
});
