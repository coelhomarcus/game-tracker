import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';

export async function registerHandler(req: Request, res: Response) {
  const { username, name, email, password } = req.body;
  const result = await authService.register(username, name, email, password);
  res.status(201).json(result);
}

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const result = await authService.login(identifier, password);
  res.status(200).json(result);
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = req.body;
  const result = await authService.refresh(refreshToken);
  res.status(200).json(result);
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.me(req.user!.id);
  res.json(user);
}

export async function changePasswordHandler(req: Request, res: Response) {
  const { currentPassword, newPassword, refreshToken } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword, refreshToken);
  res.status(204).send();
}

export async function logoutHandler(req: Request, res: Response) {
  const { refreshToken } = req.body;
  await authService.logout(refreshToken);
  res.status(204).send();
}
