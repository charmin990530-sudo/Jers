import { returnPath } from './return-path';
describe('Rutas de retorno privadas',()=>{
  it('no conserva tokens ni correos en almacenamiento de navegación',()=>{
    expect(returnPath('/checkout?email=ficticio@example.com&token=ficticio')).toBe('/checkout');
    expect(returnPath('/reset-password?token=ficticio')).toBe('/tienda');
  });
  it('rechaza destinos externos y variantes con barra inversa',()=>{
    for(const value of ['https://example.com','//example.com','/\\example.com','/\nevil'])expect(returnPath(value)).toBe('/tienda');
  });
});
