import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { detectTransactionSupport, resetTransactionSupportCache } from '../src/services/transaction.js';

beforeEach(() => resetTransactionSupportCache());
afterEach(() => { jest.restoreAllMocks(); resetTransactionSupportCache(); });

test('reconoce un router de clúster fragmentado como capaz de transacciones', async () => {
  jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ command: async () => ({ msg: 'isdbgrid' }) });
  expect(await detectTransactionSupport()).toBe(true);
});

test('un fallo de detección no degrada a escrituras sin transacción ni se cachea para siempre', async () => {
  const command = jest.fn().mockRejectedValueOnce(new Error('Fallo temporal')).mockResolvedValue({ setName: 'replica-ficticia' });
  jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ command });
  await expect(detectTransactionSupport()).rejects.toMatchObject({ statusCode: 503 });
  expect(await detectTransactionSupport()).toBe(true);
  expect(command).toHaveBeenCalledTimes(2);
});
