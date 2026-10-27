import rateLimit from 'express-rate-limit';

// Padrão de produção: 20 tentativas por 15 minutos por IP. `AUTH_RATE_LIMIT_MAX` existe para
// ambientes de teste isolados, onde suítes de integração criam dezenas de contas.
// Vale para tudo que confere senha: cadastro, login, troca de senha e exclusão da conta.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
});
