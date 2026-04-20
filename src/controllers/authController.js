const User = require("../models/user");
const Barber = require("../models/barber"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { AppError, ValidationError, NotFoundError } = require('../utils/errorHandler');
require("dotenv").config();

// Função para registrar um novo usuário
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, bio } = req.body;

    // Verifica se o e-mail já está cadastrado
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new ValidationError("E-mail já cadastrado!");
    }

    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Cria o usuário
    const user = await User.create({
      name,
      email,
      password: hashedPassword, // Armazena a senha encriptada
      role,
    });

    // Se o usuário for barbeiro, adiciona na tabela barbers
    if (role === "barbeiro") {
      await Barber.create({
        user_id: user.id,
        bio: bio || "Barbeiro sem descrição",
        created_at: new Date(),
      });
    }

    res.status(201).json({ message: "Usuário cadastrado com sucesso!", user });
  } catch (error) {
    return next(error);
  }
};

// Função para login de usuário
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundError("Usuário não encontrado!");
    }

    // Compara a senha fornecida com a senha encriptada no banco
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new AppError("Senha inválida!", 401);
    }
    // Gera um token JWT
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ message: "Login realizado com sucesso!", token });
  } catch (error) {
    return next(error);
  }
};

// Função para obter os dados do usuário autenticado
const getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] }, 
    });

    if (!user) {
      throw new NotFoundError("Usuário não encontrado!");
    }

    res.json(user);
  } catch (error) {
    return next(error);
  }
};

// Exporta as funções do controlador de autenticação
module.exports = { 
    register,
    login,
    getMe,
};
