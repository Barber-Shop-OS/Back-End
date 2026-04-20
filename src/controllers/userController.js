// Sprint 0: User controller with secure password handling and Portuguese messages
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const { NotFoundError, ValidationError } = require('../utils/errorHandler');

// Get all users (admin only - but route handles auth)
const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password'] }
        });
        res.status(200).json(users);
    } catch (error) {
        return next(error);
    }
};

// Get user by ID
const getUserById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const user = await User.findByPk(id, {
            attributes: { exclude: ['password'] }
        });
        if (!user) {
            throw new NotFoundError('Usuário não encontrado');
        }
        res.status(200).json(user); 
    } catch (error) {
        return next(error);
    }
};

// Update user with secure password handling
const updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, password } = req.body;
    try {
        const user = await User.findByPk(id);
        if (!user) {
            throw new NotFoundError('Usuário não encontrado');
        }

        // Prepare update data
        const updateData = {};
        if (name) updateData.name = name;
        if (email) {
            // Check if email is already in use by another user
            const existingUser = await User.findOne({ 
                where: { email },
                attributes: ['id']
            });
            if (existingUser && existingUser.id !== parseInt(id)) {
                throw new ValidationError('E-mail já está em uso');
            }
            updateData.email = email;
        }
        
        // Hash password if provided
        if (password) {
            if (String(password).trim().length < 6) {
                throw new ValidationError('Senha deve ter no mínimo 6 caracteres');
            }
            updateData.password = await bcrypt.hash(password, 10);
        }

        // Update user
        await User.update(updateData, { where: { id } });
        
        // Fetch and return updated user without password
        const updatedUser = await User.findByPk(id, {
            attributes: { exclude: ['password'] }
        });

        res.status(200).json({ 
            message: 'Usuário atualizado com sucesso',
            user: updatedUser
        });
    } catch (error) {
        return next(error);
    }
};

// Delete user
const deleteUser = async (req, res, next) => {
    const { id } = req.params;
    try {
        const user = await User.findByPk(id);
        if (!user) {
            throw new NotFoundError('Usuário não encontrado');
        }
        await User.destroy({ where: { id } });
        res.status(200).json({ message: 'Usuário removido com sucesso' });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};