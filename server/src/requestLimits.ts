import { rateLimit } from 'express-rate-limit';

export function createRequestLimit(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    keyGenerator: () => 'process',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false },
    message: { error: 'Request limit reached. Retry after the indicated interval.' },
  });
}