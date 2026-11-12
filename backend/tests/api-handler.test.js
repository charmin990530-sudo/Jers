import { jest } from '@jest/globals';
import handler from '../../api/index.js';

describe('Adaptador serverless', () => {
  it('rechaza subrutas manipuladas con el mismo contrato de error que Express', async () => {
    const req = { query: { path: '../.env' }, url: '/api?path=../.env' };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_API_PATH', message: expect.any(String) } });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
