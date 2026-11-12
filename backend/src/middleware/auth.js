import { z } from 'zod';
import { findUserById } from '../store/users.js';
import { verifyToken } from '../config/auth.js';

const authHeaderSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
});

export const requireAuth = async (req, res, next) => {
  try {
    const header = authHeaderSchema.parse({
      authorization: req.headers.authorization || '',
    });

    const token = header.authorization.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded?.sub) {
      return next(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    }

    const user = await findUserById(decoded.sub);

    if (!user) {
      return next(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const authError = new Error('Unauthorized');
      authError.statusCode = 401;
      return next(authError);
    }

    if (error.statusCode === 401) {
      return next(error);
    }

    return next(error);
  }
};
