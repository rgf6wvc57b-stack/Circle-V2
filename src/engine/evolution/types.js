/**
 * @typedef {{
 *   id: string,
 *   index: number,
 *   title: string,
 *   description: string,
 *   build: (radius: number) => import('../schema.js').ConstructionData,
 *   renderMode?: string,
 * }} EvolutionStep
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   steps: EvolutionStep[],
 * }} EvolutionSequence
 */

export const EVOLUTION_DEFAULT_SEQUENCE = "sacredGeometry";
