'use strict';
const rateLimit = require('express-rate-limit');

/* Brute-force and spam protection for the forms anyone can reach. */
function limiter(max, minutes, message) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
    handler: (req, res) => res.status(429).render('error', { title: 'Slow down', code: 429, message }),
  });
}

module.exports = {
  loginLimiter: limiter(10, 15, 'Too many sign-in attempts. Wait 15 minutes and try again.'),
  registerLimiter: limiter(10, 60, 'Too many accounts created from this address. Try again later.'),
  contactLimiter: limiter(8, 15, 'You have sent several messages already. Give it a few minutes.'),
};
