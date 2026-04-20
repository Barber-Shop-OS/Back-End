// Sprint 0.4: Service service with Portuguese messages
const ServiceRepository = require('../repositories/serviceRepository');
const { ValidationError, NotFoundError } = require('../utils/errorHandler');
const { Op } = require('sequelize');

// Get services with filters and pagination
const getAllServices = async (query = {}) => {
	const page = Number(query.page) > 0 ? Number(query.page) : 1;
	const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
	const offset = (page - 1) * pageSize;

	// Dynamic filters
	const where = {};
	if (query.name) where.name = { [Op.like]: `%${query.name}%` };
	if (query.minPrice || query.maxPrice) {
		where.price = {};
		if (query.minPrice) where.price[Op.gte] = Number(query.minPrice);
		if (query.maxPrice) where.price[Op.lte] = Number(query.maxPrice);
	}
	if (query.minDuration || query.maxDuration) {
		where.duration = {};
		if (query.minDuration) where.duration[Op.gte] = Number(query.minDuration);
		if (query.maxDuration) where.duration[Op.lte] = Number(query.maxDuration);
	}

	// Dynamic sorting with whitelist
	const allowedSortFields = ['name', 'price', 'duration', 'created_at'];
	const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
	const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

	// Query with filters, pagination and sorting
	const { rows, count } = await ServiceRepository.findAndCount({
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

// Get service by ID
const getServiceById = async (id) => {
	const service = await ServiceRepository.findById(id);
	if (!service) throw new NotFoundError('Serviço não encontrado');
	return service;
};

// Create new service
const createService = async (payload) => {
	const { name, description, price, duration } = payload;
	if (!name || String(name).trim() === '') throw new ValidationError("Campo 'name' é obrigatório");
	if (!description || String(description).trim() === '') throw new ValidationError("Campo 'description' é obrigatório");
	if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
		throw new ValidationError('Preço deve ser um número positivo');
	}
	if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
		throw new ValidationError('Duração deve ser um número positivo');
	}

	const service = await ServiceRepository.create({
		name,
		description,
		price: Number(price),
		duration: Number(duration),
	});
	return service;
};

// Update service
const updateService = async (id, payload) => {
	const { name, description, price, duration } = payload;
	if (!name || String(name).trim() === '') throw new ValidationError("Campo 'name' é obrigatório");
	if (!description || String(description).trim() === '') throw new ValidationError("Campo 'description' é obrigatório");
	if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
		throw new ValidationError('Preço deve ser um número positivo');
	}
	if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
		throw new ValidationError('Duração deve ser um número positivo');
	}

	// Update service in repository
	const updated = await ServiceRepository.update(id, {
		name,
		description,
		price: Number(price),
		duration: Number(duration),
	});
	if (!updated) throw new NotFoundError('Serviço não encontrado');
	return updated;
};

// Delete service
const deleteService = async (id) => {
	const ok = await ServiceRepository.remove(id);
	if (!ok) throw new NotFoundError('Serviço não encontrado');
	return true;
};

module.exports = {
	getAllServices,
	getServiceById,
	createService,
	updateService,
	deleteService,
};
