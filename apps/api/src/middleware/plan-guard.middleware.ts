import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthedUser } from "./auth.middleware.js";

export function planGuard(allowed: AuthedUser["planTier"][]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const tier = req.user?.planTier ?? "free";
    if (!allowed.includes(tier)) {
      return reply.status(403).send({
        error: "Plan upgrade required",
        requiredPlan: allowed[0],
        upgradeUrl: "/settings#subscription",
      });
    }
  };
}

