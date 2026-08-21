import { lookupBlindingEntry } from "@/lib/blinding";
import { familyOf, isFamilyCollision, type ModelFamily } from "@/lib/models/registry";

/**
 * The single sanctioned bridge between the blinding map and the evaluation path.
 *
 * `/api/evaluate` calls this with the blinding token and the proposed judge. It
 * learns only whether the pairing is allowed and, on refusal, the two families
 * involved — never the producing model's identity, which stays inside the
 * blinding map. That keeps the producing model out of the evaluation path
 * entirely while still enforcing the collision rule server-side.
 *
 * Deriving the producer from the token also removes the client's ability to
 * assert it: previously the caller passed `producing_model`, so a wrong or
 * spoofed value would have silently defeated the check.
 */

export type JudgeCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: "unknown_token" | "family_collision" | "unknown_judge";
      producing_family: ModelFamily | null;
      judge_family: ModelFamily | null;
    };

export async function checkJudgeAllowed(
  anonymizedOutputId: string,
  judgeModel: string
): Promise<JudgeCheck> {
  const entry = await lookupBlindingEntry(anonymizedOutputId);
  if (!entry) {
    // Fail closed: an unrecognized token means we cannot prove the pairing is legal.
    return {
      allowed: false,
      reason: "unknown_token",
      producing_family: null,
      judge_family: familyOf(judgeModel),
    };
  }

  const judgeFamily = familyOf(judgeModel);
  if (!judgeFamily) {
    return {
      allowed: false,
      reason: "unknown_judge",
      producing_family: familyOf(entry.model_name),
      judge_family: null,
    };
  }

  if (isFamilyCollision(entry.model_name, judgeModel)) {
    return {
      allowed: false,
      reason: "family_collision",
      producing_family: familyOf(entry.model_name),
      judge_family: judgeFamily,
    };
  }

  return { allowed: true };
}
