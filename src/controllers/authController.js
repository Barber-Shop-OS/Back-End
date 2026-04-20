// Sprint 0: Authentication controller with secure password handling and Portuguese messages
const User = require("../models/user");
const Barber = require("../models/barber"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { AppError, ValidationError, NotFoundError } = require('../utils/errorHandler');
require("dotenv").config();

// Register a new user with secure password hashing
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, bio } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ 
      where: { email },
      attributes: ['id']
    });
    if (existingUser) {
      throw new ValidationError("E-mail já está em uso");
    }

    // Validate password length
    if (!password || String(password).trim().length < 6) {
      throw new ValidationError("Senha deve ter no mínimo 6 caracteres");
    }

    // Hash password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'cliente',
    });

    // If user is barber, create barber profile
    if (role === "barbeiro") {
      await Barber.create({
        user_id: user.id,
        bio: bio || "Barbeiro sem descrição",
        created_at: new Date(),
      });
    }

    // Return user without password
    const userResponse = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });

    res.status(201).json({ 
      message: "Usuário cadastrado com sucesso", 
      user: userResponse 
    });
  } catch (error) {
    return next(error);
  }
};

// Login user and return JWT token
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError("E-mail e senha são obrigatórios");
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundError("Credenciais inválidas");
    }

    // Compare password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new AppError("Credenciais inválidas", 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ 
      message: "Login realizado com sucesso", 
      token 
    });
  } catch (error) {
    return next(error);
  }
};

// Get authenticated user profile
const getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] }, 
    });

    if (!user) {
      throw new NotFoundError("Usuário não encontrado");
    }

    res.json(user);
  } catch (error) {
    return next(error);
  }
};

module.exports = { 
    register,
    login,
    getMe,
};
