export interface StudioReward {
  id: string;
  kind: 'play-lips' | 'win-store';
  name: string;
  percent: number;
  scope: string;
  minimumExclusive: number;
  redeemedAt: string | null;
}
export interface StudioProduct {
  _id: string;
  nombre: string;
  precio: number;
  stock: number;
  cosmeticType: string | null;
  imagenes?: { url: string; esPrincipal?: boolean }[];
}
