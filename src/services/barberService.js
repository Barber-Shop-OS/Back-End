// Sprint 0.3 & 0.4: Barber service with correct role downgrade logic and Portuguese messages
const BarberRepository = require('../repositories/barberRepository');
const User = require('../models/user');
const { ValidationError, NotFoundError } = require('../utils/errorHandler');
const { Op } = require('sequelize');

// Enrich barber data with related user information
const enrichBarber = async (barber) => {
	if (!barber) return null;
	const user = await User.findByPk(barber.user_id, {
		attributes: { exclude: ['password'] }
	});
	barber.dataValues.user = user || null;
	return barber;
};

// Get barbers with filters and pagination
const getAllBarbers = async (query = {}) => {
	const page = Number(query.page) > 0 ? Number(query.page) : 1;
	const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
	const offset = (page - 1) * pageSize;

	// Dynamic filters
	const where = {};
	if (query.user_id) where.user_id = Number(query.user_id);
	if (query.bio) where.bio = { [Op.like]: `%${query.bio}%` };

	// Dynamic sorting with whitelist
	const allowedSortFields = ['created_at', 'bio', 'user_id'];
	const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
	const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

	// Query with filters, pagination and sorting
	const { rows, count } = await BarberRepository.findAndCount({
		where,
		limit: pageSize,
		offset,
		order: [[sortBy, sortDir]],
	});

	return {
		items: rows,
		page,
		pageSize,
		total: count,
		totalPages: Math.ceil(count / pageSize),
	};
};

// Get barber by ID
const getBarberById = async (id) => {
	const barber = await BarberRepository.findById(id);
	if (!barber) throw new NotFoundError('Barbeiro não encontrado');
	return enrichBarber(barber);
};

// Create new barber
const createBarber = async (payload) => {
	const { user_id, bio } = payload;
	if (!user_id) throw new ValidationError("Campo 'user_id' é obrigatório");
	if (!bio || String(bio).trim() === '') throw new ValidationError("Campo 'bio' é obrigatório");

	// Check if user exists
	const user = await User.findByPk(user_id);
	if (!user) throw new NotFoundError('Usuário não encontrado');

	const barber = await BarberRepository.create({ user_id, bio });

	// Update user role to 'barbeiro' if needed
	if (user.role !== 'barbeiro') {
		await user.update({ role: 'barbeiro' });
	}

	barber.dataValues.user = user;
	return barber;
};

// Update barber
const updateBarber = async (id, payload) => {
	const { bio } = payload;
	if (!bio || String(bio).trim() === '') throw new ValidationError("Campo 'bio' é obrigatório");

	const updated = await BarberRepository.update(id, { bio });
	if (!updated) throw new NotFoundError('Barbeiro não encontrado');
	return enrichBarber(updated);
};

// Delete barber - FIXED: per-user role downgrade logic
const deleteBarber = async (id) => {
	const barber = await BarberRepository.findById(id);
	if (!barber) throw new NotFoundError('Barbeiro não encontrado');

	const user = await User.findByPk(barber.user_id);

	// Remove barber record
	await BarberRepository.remove(id);

	// Check if this specific user has any remaining barber records
	if (user && user.role === 'barbeiro') {
		const remainingBarbersForUser = await BarberRepository.findAll({
			where: { user_id: barber.user_id }
		});
		
		// If user has no more barber records, downgrade to 'cliente'
		if (!remainingBarbersForUser || remainingBarbersForUser.length === 0) {
			await user.update({ role: 'cliente' });
		}
	}

	return true;
};

module.exports = {
	getAllBarbers,
	getBarberById,
	createBarber,
	updateBarber,
	deleteBarber,
};