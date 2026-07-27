import {
  buildEmpty,
  buildOnePoint,
  buildOneSphere,
  buildVesicaSpheres,
  buildVesicaIntersections,
  buildThirdSphere,
  buildSeedOfLifeStage,
} from "../stages/earlySeed.js";
import { buildFlowerOfLifeStage, buildFruitOfLifeStage } from "../stages/flowerFruit.js";
import { buildMetatronCubeStage, buildPlatonicSolidsStage } from "../stages/metatronPlatonics.js";
import { buildTreeOfLifeStage } from "../stages/treeStage.js";

/**
 * First Evolution sequence: empty space → Tree of Life (Geometric).
 * Every step is mathematically generated; nothing appears before it is constructible.
 */
export const sacredGeometrySequence = {
  id: "sacredGeometry",
  label: "Sacred Geometry",
  description:
    "Witness geometry emerging from a single point through vesica, Seed, Flower, Fruit, Metatron, Platonics, and the Geometric Tree of Life.",
  steps: [
    {
      id: "empty",
      index: 0,
      title: "Empty Space",
      description: "The beginning — no points, no measures.",
      build: buildEmpty,
      renderMode: "points",
    },
    {
      id: "point",
      index: 1,
      title: "One Point",
      description: "Choose the origin — the first free choice of the construction.",
      build: buildOnePoint,
      renderMode: "points",
    },
    {
      id: "sphere",
      index: 2,
      title: "First Sphere",
      description: "Open the compass to radius R and draw the first sphere about the origin.",
      build: buildOneSphere,
      renderMode: "mixed",
    },
    {
      id: "vesica",
      index: 3,
      title: "Vesica Piscis",
      description:
        "Place a second center exactly one radius away so each center lies on the other's surface.",
      build: buildVesicaSpheres,
      renderMode: "mixed",
    },
    {
      id: "vesicaIntersections",
      index: 4,
      title: "Intersection Points",
      description: "Mark both intersection points of the two equal circles — the vesica tips.",
      build: buildVesicaIntersections,
      renderMode: "mixed",
    },
    {
      id: "thirdSphere",
      index: 5,
      title: "Third Sphere",
      description: "Construct the next center from a vesica intersection and draw its sphere.",
      build: buildThirdSphere,
      renderMode: "mixed",
    },
    {
      id: "seed",
      index: 6,
      title: "Seed of Life",
      description: "Continue the compass walk until the six surrounding spheres close the Seed.",
      build: buildSeedOfLifeStage,
      renderMode: "mixed",
    },
    {
      id: "flower",
      index: 7,
      title: "Flower of Life",
      description: "Extend the equal-radius packing into the Flower of Life lattice.",
      build: buildFlowerOfLifeStage,
      renderMode: "mixed",
    },
    {
      id: "fruit",
      index: 8,
      title: "Fruit of Life",
      description: "Thirteen equal spheres — the generative skeleton of Metatron's Cube.",
      build: buildFruitOfLifeStage,
      renderMode: "mixed",
    },
    {
      id: "metatron",
      index: 9,
      title: "Metatron's Cube",
      description: "Connect every Fruit center to every other with the straightedge.",
      build: buildMetatronCubeStage,
      renderMode: "mixed",
    },
    {
      id: "platonics",
      index: 10,
      title: "Platonic Solids",
      description:
        "Cube, octahedron, and dual tetrahedra emerge at the Fruit / Metatron scale.",
      build: buildPlatonicSolidsStage,
      renderMode: "mixed",
    },
    {
      id: "tree",
      index: 11,
      title: "Tree of Life",
      description: "Geometric Tree of Life — equal-radius hex foundation grown from the same language.",
      build: buildTreeOfLifeStage,
      renderMode: "mixed",
    },
  ],
};
