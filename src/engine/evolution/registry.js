import { sacredGeometrySequence } from "./sequences/sacredGeometry.js";
import { EVOLUTION_DEFAULT_SEQUENCE } from "./types.js";

const SEQUENCES = {
  [sacredGeometrySequence.id]: sacredGeometrySequence,
};

export function listEvolutionSequences() {
  return Object.values(SEQUENCES).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    stepCount: s.steps.length,
  }));
}

export function getEvolutionSequence(id = EVOLUTION_DEFAULT_SEQUENCE) {
  const seq = SEQUENCES[id];
  if (!seq) throw new Error(`Unknown evolution sequence: ${id}`);
  return seq;
}

export function registerEvolutionSequence(sequence) {
  if (!sequence?.id || !Array.isArray(sequence.steps)) {
    throw new Error("Evolution sequence requires id and steps[]");
  }
  SEQUENCES[sequence.id] = sequence;
}

export { EVOLUTION_DEFAULT_SEQUENCE };
