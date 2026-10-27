import { Router } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from '../controllers/auth.controller';
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from '../schemas/auth.schema';
import { requireAuth } from '../middlewares/auth';
import { authLimiter } from '../middlewares/authLimiter';
import { validateBody } from '../middlewares/validate';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validateBody(registerSchema), registerHandler);
authRouter.post('/login', authLimiter, validateBody(loginSchema), loginHandler);
authRouter.post('/refresh', validateBody(refreshSchema), refreshHandler);
authRouter.post('/logout', validateBody(refreshSchema), logoutHandler);
// Confere a senha atual com bcrypt: o mesmo limite do login contém tentativas em série.
authRouter.post('/password', authLimiter, requireAuth, validateBody(changePasswordSchema), changePasswordHandler);
authRouter.get('/me', requireAuth, meHandler);
