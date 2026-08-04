import { MERKABA_STUDY } from "./definitions/merkabaStudy.js";
import { DIMENSIONAL_STUDY } from "./definitions/dimensionalStudy.js";

export { MERKABA_STUDY, DIMENSIONAL_STUDY };

/** @typedef {typeof MERKABA_STUDY | typeof DIMENSIONAL_STUDY} StudyDefinition */

export const STUDY_REGISTRY = Object.freeze([
  MERKABA_STUDY,
  DIMENSIONAL_STUDY,
]);

export function getStudyById(id) {
  return STUDY_REGISTRY.find((study) => study.id === id) ?? null;
}

export function listStudies() {
  return STUDY_REGISTRY.map(({ id, title, subtitle }) => ({ id, title, subtitle }));
}
