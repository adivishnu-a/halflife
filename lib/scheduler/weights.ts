import weightsV1 from "@/model/weights.v1.json";

import type { Weights } from "./hlr";

/** The shipped model. Retraining bumps the file and this import in the same pull request. */
export const WEIGHTS: Weights = {
  version: weightsV1.version,
  features: weightsV1.features as Weights["features"],
  theta: weightsV1.theta,
  cardTerms: weightsV1.card_terms,
};
