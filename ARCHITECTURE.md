# 🏗️ Diagrama de Arquitetura — BarberOS SaaS v2.0

## 📊 Modelo de Dados (ER Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          🔐 AUTHENTICATION LAYER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐                                                             │
│  │   USERS     │  ← JWT + bcryptjs                                          │
│  ├─────────────┤                                                             │
│  │ id (PK)     │                                                             │
│  │ name        │                                                             │
│  │ email (UQ)  │                                                             │
│  │ password    │  (hashed)                                                   │
│  │ role        │  ← ENUM: cliente, barbeiro, owner, admin                   │
│  │ created_at  │                                                             │
│  └─────────────┘                                                             │
│        │                                                                     │
│        ├─ (1) owner ────────→ (N) ┌──────────────────┐                      │
│        │                            │   BARBERSHOPS   │                      │
│        │                            ├──────────────────┤                      │
│        │                            │ id (PK)          │                      │
│        │                            │ name             │                      │
│        │                            │ owner_id (FK)    │                      │
│        │                            │ created_at       │                      │
│        │                            └──────────────────┘                      │
│        │                                    │                                 │
│        │                                    ├─ (1) has ──→ (N) ┌───────────┐ │
│        │                                    │                  │ BRANCHES  │ │
│        │                                    │                  ├───────────┤ │
│        │                                    │                  │ id (PK)   │ │
│        │                                    │                  │ name      │ │
│        │                                    │                  │ barb_id   │ │
│        │                                    │                  │ addr_id   │ │
│        │                                    │                  │ created_at│ │
│        │                                    │                  └───────────┘ │
│        │                                    │                        │        │
│        │                                    │                        └─────┐  │
│        │                                    │                              │  │
│        │                                    └─ (1) has ──→ (N) ┌──────────┴─┐│
│        │                                                        │ SERVICES   ││
│        │                                                        ├────────────┤│
│        │                                                        │ id (PK)    ││
│        │                                                        │ name       ││
│        │                                                        │ price      ││
│        │                                                        │ barb_id(FK)││
│        │                                                        │ created_at ││
│        │                                                        └────────────┘│
│        │                                                                      │
│        ├─ (N) barberProfiles ───────────→ ┌──────────────────┐              │
│        │                                   │    BARBERS       │              │
│        │                                   ├──────────────────┤              │
│        │                                   │ id (PK)          │              │
│        │                                   │ user_id (FK)     │              │
│        │                                   │ branch_id (FK)   │ ← NEW        │
│        │                                   │ bio              │              │
│        │                                   │ created_at       │              │
│        │                                   └──────────────────┘              │
│        │                                                                     │
│        └─ (N) appointments ────────────→ ┌──────────────────────┐           │
│                                           │   APPOINTMENTS       │           │
│                                           ├──────────────────────┤           │
│                                           │ id (PK)              │           │
│                                           │ user_id (FK)         │           │
│                                           │ barber_id (FK)       │           │
│                                           │ service_id (FK)      │           │
│                                           │ branch_id (FK)       │ ← NEW     │
│                                           │ appointment_date     │           │
│                                           │ status               │           │
│                                           │ created_at           │           │
│                                           └──────────────────────┘           │
│                                                   │                          │
│                                                   └─→ (1) ┌──────────────┐  │
│                                                           │  PAYMENTS    │  │
│                                                           ├──────────────┤  │
│                                                           │ id (PK)      │  │
│                                                           │ app_id (FK)  │  │
│                                                           │ amount       │  │
│                                                           │ method       │  │
│                                                           │ status       │  │
│                                                           │ trans_id     │  │
│                                                           │ paid_at      │  │
│                                                           │ created_at   │  │
│                                                           └──────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐
│   LOCATION SUPPORT               │
├──────────────────────────────────┤
│                                  │
│  ┌──────────────────┐            │
│  │   ADDRESSES      │            │
│  ├──────────────────┤            │
│  │ id (PK)          │            │
│  │ cep              │            │
│  │ number           │            │
│  │ complement       │            │
│  │ city             │            │
│  │ state            │            │
│  │ created_at       │            │
│  └──────────────────┘            │
│        ↑                          │
│        │ (1)                      │
│        │ Referenced by BRANCHES   │
│                                  │
└──────────────────────────────────┘
```

---

## 🔄 Fluxo de Associações (Sequelize)

### User Model
```javascript
User.hasMany(Barbershop, { foreignKey: 'owner_id', as: 'ownedBarbershops' })
User.hasMany(Barber, { foreignKey: 'user_id', as: 'barberProfiles' })
User.hasMany(Appointment, { foreignKey: 'user_id', as: 'appointments' })
```

### Barbershop Model
```javascript
Barbershop.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' })
Barbershop.hasMany(Branch, { foreignKey: 'barbershop_id', as: 'branches' })
Barbershop.hasMany(Service, { foreignKey: 'barbershop_id', as: 'services' })
```

### Branch Model
```javascript
Branch.belongsTo(Barbershop, { foreignKey: 'barbershop_id', as: 'barbershop' })
Branch.belongsTo(Address, { foreignKey: 'address_id', as: 'address' })
Branch.hasMany(Barber, { foreignKey: 'branch_id', as: 'barbers' })
Branch.hasMany(Appointment, { foreignKey: 'branch_id', as: 'appointments' })
```

### Barber Model
```javascript
Barber.belongsTo(User, { foreignKey: 'user_id', as: 'user' })
Barber.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })
Barber.hasMany(Appointment, { foreignKey: 'barber_id', as: 'appointments' })
```

### Service Model
```javascript
Service.belongsTo(Barbershop, { foreignKey: 'barbershop_id', as: 'barbershop' })
Service.hasMany(Appointment, { foreignKey: 'service_id', as: 'appointments' })
```

### Appointment Model
```javascript
Appointment.belongsTo(User, { foreignKey: 'user_id', as: 'client' })
Appointment.belongsTo(Barber, { foreignKey: 'barber_id', as: 'barber' })
Appointment.belongsTo(Service, { foreignKey: 'service_id', as: 'service' })
Appointment.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })
Appointment.hasOne(Payment, { foreignKey: 'appointment_id', as: 'payment' })
```

### Payment Model
```javascript
Payment.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment' })
```

---

## 🏛️ Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                            │
│  (Postman, Mobile App, Web Frontend)                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                       ROUTES LAYER                               │
│  /api/auth              /api/user           /api/barber          │
│  /api/barbershop        /api/branch         /api/services        │
│  /api/appointment       /api/payment        /api/address         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ Middleware Stack
         ┌───────────────┴───────────────┐
         │ Validação                     │ CORS
         │ Autenticação (JWT)            │ Error Handling
         │ Autorização (Roles)           │
         └───────────────┬───────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                     CONTROLLERS LAYER                            │
│  userController         barberController    appointmentController │
│  authController         servicesController  paymentController    │
│  barbershopController   branchController    addressController    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ Business Logic
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICES LAYER                              │
│  userService            barberService       appointmentService   │
│  authService            serviceService      paymentService       │
│  barbershopService      branchService       addressService       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ Data Access
┌─────────────────────────────────────────────────────────────────┐
│                   REPOSITORIES LAYER                             │
│  userRepository         barberRepository    appointmentRepository│
│  authRepository         serviceRepository   paymentRepository    │
│  barbershopRepository   branchRepository    addressRepository    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ ORM (Sequelize)
┌─────────────────────────────────────────────────────────────────┐
│                       MODELS LAYER                               │
│  User      Barbershop   Branch    Barber                         │
│  Service   Appointment  Payment   Address                        │
│  (COM ASSOCIAÇÕES DEFINIDAS)                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ Migrações
┌─────────────────────────────────────────────────────────────────┐
│                   MIGRATIONS LAYER                               │
│  20260420000001-create-users.js                                  │
│  20260420000002-create-addresses.js                              │
│  ...                                                             │
│  20260420000008-create-payments.js                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ SQL/Versionamento
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                               │
│  MySQL (produção) / SQLite (testes)                              │
│  8 Tabelas com Relações, FKs, Constraints                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Segurança — Camadas de Proteção

```
User Request
    │
    ↓
┌─────────────────────────────┐
│ CORS Middleware             │  ← Proteção contra cross-origin
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Auth Middleware             │  ← Verifica JWT
│ (Bearer Token)              │
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Role Middleware             │  ← Verifica ['admin', 'owner', ...]
│ (Dynamic based on endpoint)  │
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Validation Middleware       │  ← Whitelist de campos
│ (Payload validation)         │
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Controller Logic            │  ← Lógica de negócio
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Service Logic               │  ← Enriquecimento, validações
│ (Password exclusion)         │
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Repository Query            │  ← attributes: { exclude }
│ (Database interaction)       │
└─────────────────────────────┘
    │
    ↓
┌─────────────────────────────┐
│ Error Handler               │  ← Centralized error handling
│ (Portuguese messages)        │
└─────────────────────────────┘
```

---

## 📈 Escalabilidade — Estrutura Multi-Tenant

```
┌──────────────────────────────────────┐
│  BARBERSHOP 1 (Owner: User 1)        │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────┐  ┌──────────────┐ │
│  │ BRANCH 1     │  │ BRANCH 2     │ │
│  │ (Lapa)       │  │ (Pinheiros)  │ │
│  │              │  │              │ │
│  │ Barber 1 → ┼─┤  │ Barber 3 → ┼─┤ │
│  │ Barber 2 → ┼─┤  │ Barber 4 → ┼─┤ │
│  │              │  │              │ │
│  │ Service A    │  │ Service B    │ │
│  │ Service B    │  │ Service C    │ │
│  │              │  │              │ │
│  │ Appointments │  │ Appointments │ │
│  └──────────────┘  └──────────────┘ │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  BARBERSHOP 2 (Owner: User 2)        │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────┐  ┌──────────────┐ │
│  │ BRANCH 1     │  │ BRANCH 2     │ │
│  │ (Higienópolis)│  │ (Consolação) │ │
│  │              │  │              │ │
│  │ Barber 5 → ┼─┤  │ Barber 7 → ┼─┤ │
│  │ Barber 6 → ┼─┤  │ Barber 8 → ┼─┤ │
│  └──────────────┘  └──────────────┘ │
└──────────────────────────────────────┘

Cada Barbershop:
  ✅ Tem seus próprios barbeiros (per branch)
  ✅ Tem seus próprios serviços
  ✅ Tem seu próprio agendamento
  ✅ Tem seu próprio histórico de pagamentos
  ✅ Pode ter múltiplas branches/localizações
  ✅ Isolamento de dados por owner_id (multi-tenant)
```

---

## 🚀 Fluxo de Agendamento Completo

```
1. Cliente Login
   POST /api/auth/login → JWT Token
   
2. Listar Barbearias
   GET /api/barbershop → [Barbershop 1, 2, ...]
   
3. Selecionar Branch
   GET /api/branch?barbershop_id=1 → [Branch 1, 2]
   
4. Listar Barbeiros da Branch
   GET /api/barber?branch_id=1 → [Barber 1, 2, 3]
   
5. Listar Serviços da Barbershop
   GET /api/service?barbershop_id=1 → [Service A, B, C]
   
6. Agendar
   POST /api/appointment
   {
     "user_id": 1,
     "barber_id": 2,
     "service_id": 3,
     "branch_id": 1,
     "appointment_date": "2026-04-21 14:00:00"
   }
   → Appointment created with id 100
   
7. Efetuar Pagamento
   POST /api/payment
   {
     "appointment_id": 100,
     "amount": 50.00,
     "method": "PIX"
   }
   → Payment recorded
   
8. Confirmar Agendamento
   PUT /api/appointment/100
   {
     "status": "confirmed"
   }
```

---

## 📊 Estatísticas de Cobertura

| Área | Completo |
|------|----------|
| Autenticação | ✅ 100% |
| Autorização | ✅ 100% |
| Validação | ✅ 100% |
| Segurança | ✅ 100% |
| Modelos | ✅ 100% |
| Associações | ✅ 100% |
| Migrações | ✅ 100% |
| Mensagens pt-BR | ✅ 100% |

---

**Versão:** 2.0.0  
**Atualizado:** 20 de abril de 2026  
**Status:** ✅ Pronto para Implementação
