import type { LatLon } from './geo';

/**
 * Dati reali condivisi dalle mappe venete, presi da OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * Le ferrovie e i fiumi sono semplificati a un punto ogni 500-1000 m circa.
 */

/**
 * Muson dei Sassi, da nord (Fonte) a sud (Camposampiero).
 * In OSM il tratto tra Castello di Godego e Camposampiero non ha nome nella nostra estrazione:
 * lì il corso è ricostruito tenendo Sant'Andrea "oltre il Muson" a ovest e Treville a est.
 */
export const MUSON: LatLon[] = [
  [45.775, 11.868], [45.75, 11.872], [45.735, 11.874], [45.7207, 11.8766], [45.71, 11.879], [45.6997, 11.8819],
  [45.6947, 11.8859], [45.6891, 11.8868], [45.678, 11.888], [45.666, 11.893], [45.655, 11.9], [45.645, 11.905], [45.63, 11.909],
  [45.61, 11.914], [45.58, 11.917], [45.5307, 11.9175],
];

/** Stazione di Castelfranco Veneto e le cinque linee che partono da lì. */
export const CASTELFRANCO_STATION: LatLon = [45.66666, 11.93403];
export const CASTELFRANCO_RAILS: LatLon[][] = [
  // verso Cittadella e Vicenza
  [[45.6664, 11.9341], [45.6655, 11.9222], [45.6644, 11.9147], [45.6624, 11.9021], [45.6605, 11.8896], [45.6585, 11.8771], [45.656, 11.8586], [45.6548, 11.8464], [45.6529, 11.8284], [45.6504, 11.8011]],
  // verso Bassano
  [[45.6655, 11.9222], [45.6695, 11.9119], [45.6753, 11.9012], [45.6805, 11.8916], [45.6889, 11.876], [45.6971, 11.861], [45.71, 11.84]],
  // verso Treviso
  [[45.6664, 11.9341], [45.6673, 11.9441], [45.6681, 11.9651], [45.669, 11.9913], [45.6702, 12.0136], [45.6705, 12.0206], [45.672, 12.05]],
  // verso Montebelluna
  [[45.6676, 11.9442], [45.6744, 11.9549], [45.6792, 11.9604], [45.6904, 11.973], [45.706, 11.9897], [45.7112, 11.9951], [45.73, 12.015]],
  // verso Padova (Camposampiero)
  [[45.6655, 11.9222], [45.6573, 11.9174], [45.6395, 11.9208], [45.6217, 11.9247], [45.6052, 11.9296], [45.5689, 11.9286]],
  // verso Venezia (Piombino Dese)
  [[45.667, 11.9412], [45.6638, 11.9476], [45.6557, 11.9496], [45.6464, 11.9524], [45.6393, 11.9589], [45.6321, 11.9663], [45.6247, 11.974], [45.619, 11.9829], [45.6094, 12.0005]],
];
