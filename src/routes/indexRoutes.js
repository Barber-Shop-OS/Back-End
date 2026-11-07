// Central route registry for the module-based API structure.
const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/authRoutes');
const userRoutes = require('../modules/user/userRoutes');
const barberRoutes = require('../modules/barber/barberRoutes');
const serviceRoutes = require('../modules/service/serviceRoutes');
const appointmentRoutes = require('../modules/appointment/appointmentRoutes');
const barbershopRoutes = require('../modules/barbershop/barbershopRoutes');
const branchRoutes = require('../modules/branch/branchRoutes');
const addressRoutes = require('../modules/address/addressRoutes');
const paymentRoutes = require('../modules/payment/paymentRoutes');
const adminRoutes = require('../modules/admin/adminRoutes');

router.use('/api/auth', authRoutes);
router.use('/api/user', userRoutes);
router.use('/api/barber', barberRoutes);
router.use('/api/services', serviceRoutes);
router.use('/api/appointment', appointmentRoutes);
router.use('/api/barbershop', barbershopRoutes);
router.use('/api/branch', branchRoutes);
router.use('/api/address', addressRoutes);
router.use('/api/payment', paymentRoutes);
router.use('/api/admin', adminRoutes);

module.exports = router;

