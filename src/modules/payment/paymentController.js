// Payment controller for create, lookup, and status updates.
const paymentService = require('./paymentService');
const { created, success } = require('../../utils/responseHandler');

const create = async (req, res, next) => {
  try {
    const payment = await paymentService.create(req.body, req.user);
    return created(res, { message: 'Pagamento registrado com sucesso', payment });
  } catch (error) {
    return next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const payment = await paymentService.findById(req.params.id, req.user);
    return success(res, payment);
  } catch (error) {
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const payment = await paymentService.updateStatus(req.params.id, req.body.status, req.user);
    return success(res, { message: 'Status do pagamento atualizado com sucesso', payment });
  } catch (error) {
    return next(error);
  }
};

const getByAppointment = async (req, res, next) => {
  try {
    const payment = await paymentService.findByAppointmentId(req.params.appointment_id, req.user);
    return success(res, payment);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  create,
  getById,
  updateStatus,
  getByAppointment,
};