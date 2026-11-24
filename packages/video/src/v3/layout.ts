import {Orient} from './types';

export type Layout = {
  W: number;
  H: number;
  colW: number;
  // content layer
  titleTop: number;
  titleSize: number;
  cardTop: number;
  cardW: number;
  cardH: number;
  cardBase: number;
  zoneBottom: number; // bottom edge of the content zone above phones (category/benchmark)
  barMax: number;
  creditTop: number;
  creditSize: number;
  chipSize: number;
  vsSize: number;
  badge: number;
};

export const layout = (orient: Orient, n: number): Layout => {
  if (orient === 'land') {
    const W = 1920;
    const colW = W / n;
    return {
      W, H: 1080, colW,
      titleTop: 30, titleSize: 98,
      cardTop: 150, cardW: colW * (n === 2 ? 0.62 : 0.7), cardH: 180, cardBase: n === 2 ? 104 : 84,
      zoneBottom: 365, barMax: 140, creditTop: 122, creditSize: 28, chipSize: 58, vsSize: 110, badge: 80,
    };
  }
  const W = 1080;
  const colW = W / n;
  return {
    W, H: 1920, colW,
    titleTop: 140, titleSize: 96,
    cardTop: 330, cardW: colW * (n === 2 ? 0.84 : 0.88), cardH: n === 2 ? 220 : 185, cardBase: n === 2 ? 96 : 64,
    zoneBottom: 610, barMax: 210, creditTop: 252, creditSize: 32, chipSize: 52, vsSize: 120, badge: 76,
  };
};
