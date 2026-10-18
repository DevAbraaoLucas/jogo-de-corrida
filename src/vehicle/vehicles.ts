import { buildFuscaModel, FUSCA_PALETTE, type CarModel } from './VehicleModel';
import { FUSCA_PARAMS, type VehicleParams } from './VehicleParams';

/**
 * Catálogo de veículos. Um carro novo = parâmetros de direção + função que
 * monta o modelo 3D. A física é a mesma para todos.
 */
export interface VehicleDefinition {
  id: string;
  name: string;
  params: VehicleParams;
  buildModel: () => CarModel;
}

export const VEHICLES: Record<string, VehicleDefinition> = {
  fusca: {
    id: 'fusca',
    name: 'Fusquinha',
    params: FUSCA_PARAMS,
    buildModel: () => buildFuscaModel(FUSCA_PALETTE),
  },
};
