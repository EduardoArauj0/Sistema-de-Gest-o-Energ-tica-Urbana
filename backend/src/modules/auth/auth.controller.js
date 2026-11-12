const { authService } = require('./auth.service');
const { SESSION_COOKIE_NAME, extractSessionToken } = require('../../middlewares/auth.middleware');

class AuthController {
  login(req, res, next) {
    try {
      const result = authService.login(req.body || {});

      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax`
      );

      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: 'Autenticação realizada com sucesso.',
        token: result.token,
        expiresAt: result.expiresAt,
        timeoutMinutes: result.timeoutMinutes,
        initialView: result.initialView,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  }

  logout(req, res, next) {
    try {
      const token = req.sessionToken || extractSessionToken(req);
      authService.logout(token, req.user || null);

      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      );

      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: 'Sessão encerrada com sucesso.',
      });
    } catch (err) {
      next(err);
    }
  }

  me(req, res, next) {
    try {
      const initialView = req.user.role === 'gestor' ? 'gestor-dashboard' : 'tecnico-os';
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        user: req.user,
        session: req.session,
        initialView,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  AuthController,
  authController: new AuthController(),
};
