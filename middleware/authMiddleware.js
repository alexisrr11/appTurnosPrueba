import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_prod';

/**
 * Middleware de autenticación con JWT.
 * Espera: Authorization: Bearer <token>
 */
export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token no enviado' });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded?.userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.userId = decoded.userId;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
