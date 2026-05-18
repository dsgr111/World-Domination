import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { db } from "./db.js";

const getUserByIdStmt = db.prepare("SELECT id, email, nickname, avatar_emoji FROM users WHERE id = ?");

export const getUserById = (id) => getUserByIdStmt.get(id);

export const signToken = (user) => {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: "7d" });
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

export const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "USER_NOT_FOUND" });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
};
