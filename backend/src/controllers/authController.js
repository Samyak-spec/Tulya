import { registerUser, loginUser, getUserById, registerSchema, loginSchema } from '../services/authService.js';

export const register = async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const data = await registerUser(payload);

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const data = await loginUser(payload);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};
