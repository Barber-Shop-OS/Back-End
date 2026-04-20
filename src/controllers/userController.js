const User = require('../models/user');
const { NotFoundError } = require('../utils/errorHandler');

// Função para obter todos os usuários
const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.findAll();
        res.status(200).json(users);
    } catch (error) {
        return next(error);
    }
};

// Função para obter um usuário por ID
const getUserById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const user = await User.findByPk(id, {
            attributes: { exclude: [] }, 
        });
        if (!user) {
            throw new NotFoundError('User não encontrado');
        }
        res.status(200).json(user); 
    } catch (error) {
        return next(error);
    }
};

// Função para atualizar um usuário existente
const updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, password } = req.body;
    try {
        const user = await User.findByPk(id);
        if (!user) {
            throw new NotFoundError('User não encontrado');
        }
        await User.update({ name, email, password }, { where: { id } });
        res.status(200).json({ message: 'User atualizado com sucesso' });
    } catch (error) {
        return next(error);
    }
};

// Função para remover um usuário
const deleteUser = async (req, res, next) => {
    const { id } = req.params;
    try {
        const user = await User.findByPk(id);
        if (!user) {
            throw new NotFoundError('User não encontrado');
        }
        await User.destroy({ where: { id } });
        res.status(200).json({ message: 'User removido com sucesso' });
    } catch (error) {
        return next(error);
    }
};

// Exporta as funções do controlador de usuários
module.exports = {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};