# 📚 Documentação da API BarberOS

## 🚀 Início Rápido

### Acessar Documentação Interativa (Swagger)
```bash
http://localhost:3000/api/docs
```

### Arquivos de Documentação

| Arquivo | Descrição |
|---------|-----------|
| **SWAGGER_DOCUMENTATION.md** | Documentação completa em Markdown com todos os endpoints |
| **API_ENDPOINTS_SUMMARY.json** | Resumo estruturado em JSON com todos os endpoints |
| **src/config/swagger.js** | Configuração do Swagger/OpenAPI 3.0 |

---

## 📊 Estatísticas da API

- **Total de Endpoints**: 46
- **Endpoints Públicos**: 12
- **Endpoints Protegidos**: 34
- **Módulos**: 9 (Auth, User, Barber, Service, Appointment, Payment, Barbershop, Branch, Address)

### Distribuição por Método HTTP

| Método | Quantidade |
|--------|-----------|
| GET | 18 |
| POST | 12 |
| PUT | 14 |
| DELETE | 2 |

---

## 🔐 Autenticação

### Obter Token JWT

1. **Registre um novo usuário**:
   ```bash
   POST /api/auth/register
   {
     "name": "Seu Nome",
     "email": "seu@email.com",
     "password": "senha123"
   }
   ```

2. **Ou faça login**:
   ```bash
   POST /api/auth/login
   {
     "email": "seu@email.com",
     "password": "senha123"
   }
   ```

3. **Use o token retornado**:
   ```bash
   Authorization: Bearer <seu_token_jwt>
   ```

---

## 📂 Módulos da API

### 🔓 **Auth** - Autenticação
- `POST /auth/register` - Registrar usuário
- `POST /auth/login` - Fazer login
- `GET /auth/me` - Obter usuário atual

### 👥 **User** - Gestão de Usuários
- `GET /user` - Listar usuários (admin)
- `GET /user/{id}` - Obter usuário por ID
- `PUT /user/{id}` - Atualizar usuário
- `DELETE /user/{id}` - Deletar usuário (admin)

### 💈 **Barber** - Gestão de Barbeiros
- `GET /barber` - Listar barbeiros
- `GET /barber/{id}` - Obter barbeiro por ID
- `POST /barber` - Criar barbeiro (admin, owner)
- `PUT /barber/{id}` - Atualizar barbeiro (admin, owner)
- `DELETE /barber/{id}` - Deletar barbeiro (admin, owner)

### 🛠️ **Service** - Gestão de Serviços
- `GET /services` - Listar serviços
- `GET /services/{id}` - Obter serviço por ID
- `POST /services` - Criar serviço (admin, owner)
- `PUT /services/{id}` - Atualizar serviço (admin, owner)
- `DELETE /services/{id}` - Deletar serviço (admin, owner)

### 📅 **Appointment** - Gestão de Agendamentos
- `GET /appointment` - Listar agendamentos (admin, owner, barbeiro)
- `GET /appointment/{id}` - Obter agendamento por ID
- `POST /appointment` - Criar agendamento
- `PUT /appointment/{id}` - Atualizar status do agendamento
- `DELETE /appointment/{id}` - Deletar agendamento

### 💳 **Payment** - Gestão de Pagamentos
- `POST /payment` - Registrar pagamento
- `GET /payment/{id}` - Obter pagamento por ID
- `GET /payment/appointment/{appointment_id}` - Obter pagamento por agendamento
- `PUT /payment/{id}/status` - Atualizar status do pagamento

### 🏪 **Barbershop** - Gestão de Barbearias
- `GET /barbershop` - Listar barbearias
- `GET /barbershop/{id}` - Obter barbearia por ID
- `POST /barbershop` - Criar barbearia (admin, owner)
- `PUT /barbershop/{id}` - Atualizar barbearia (admin, owner)
- `DELETE /barbershop/{id}` - Deletar barbearia (admin)

### 🏢 **Branch** - Gestão de Filiais
- `GET /branch` - Listar filiais
- `GET /branch/{id}` - Obter filial por ID
- `POST /branch` - Criar filial (admin, owner)
- `PUT /branch/{id}` - Atualizar filial (admin, owner)
- `DELETE /branch/{id}` - Deletar filial (admin, owner)

### 📍 **Address** - Gestão de Endereços
- `POST /address` - Criar endereço (admin, owner)
- `GET /address/{id}` - Obter endereço por ID (autenticado)
- `PUT /address/{id}` - Atualizar endereço (admin, owner)

---

## 👤 Perfis de Usuário

| Perfil | Descrição | Permissões |
|--------|-----------|-----------|
| **cliente** | Usuário comum | Agendar serviços, visualizar próprias requisições |
| **barbeiro** | Profissional | Gerenciar agendamentos, processar pagamentos |
| **owner** | Proprietário | Gerenciar filiais, barbeiros, serviços |
| **admin** | Administrador | Acesso completo ao sistema |

---

## 🔄 Rate Limiting

Alguns endpoints possuem proteção contra abuso:

| Tipo | Limite | Período |
|------|--------|---------|
| Auth (Register/Login) | 5 requisições | 15 minutos |
| Payment | 10 requisições | 1 minuto |
| General API | 100 requisições | 1 minuto |

**Resposta ao exceder limite**: `429 Too Many Requests`

---

## 📝 Exemplos de Uso

### Exemplo 1: Criar um Agendamento

```bash
# 1. Fazer login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cliente@example.com","password":"senha123"}'

# Resposta contém: token

# 2. Criar agendamento
curl -X POST http://localhost:3000/api/appointment \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "barber_id": 1,
    "service_id": 1,
    "branch_id": 1,
    "appointment_date": "2026-06-10T14:00:00.000Z",
    "status": "pendente"
  }'
```

### Exemplo 2: Registrar Pagamento

```bash
curl -X POST http://localhost:3000/api/payment \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "appointment_id": 1,
    "amount": 80,
    "method": "PIX"
  }'
```

### Exemplo 3: Listar Barbearias

```bash
curl -X GET http://localhost:3000/api/barbershop?page=1&pageSize=10
```

---

## 🛡️ Códigos de Resposta HTTP

| Código | Significado |
|--------|-----------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 409 | Conflict - Conflito (ex: duplicado) |
| 429 | Too Many Requests - Rate limit |
| 500 | Internal Server Error |

---

## 📋 Estrutura de Resposta

### Sucesso
```json
{
  "message": "Operação realizada com sucesso",
  "data": {
    "id": 1,
    "name": "Exemplo"
  }
}
```

### Erro
```json
{
  "message": "Descrição do erro",
  "code": "ERROR_CODE"
}
```

### Paginação
```json
{
  "items": [],
  "page": 1,
  "pageSize": 10,
  "total": 0,
  "totalPages": 0
}
```

---

## 🔗 Links Úteis

- **Swagger UI**: http://localhost:3000/api/docs
- **Repositório**: [GitHub - BarberOS](https://github.com/barberos)
- **Documentação Detalhada**: Ver `SWAGGER_DOCUMENTATION.md`
- **Resumo JSON**: Ver `API_ENDPOINTS_SUMMARY.json`

---

## ✅ Checklist de Implementação

- [x] Autenticação com JWT
- [x] Rate limiting
- [x] Validação de dados
- [x] Middleware de erros
- [x] Documentação Swagger/OpenAPI 3.0
- [x] Suporte a múltiplas filiais
- [x] Sistema de perfis de usuário
- [x] Gestão de pagamentos
- [x] Logging de requisições

---

## 📞 Suporte

Para dúvidas sobre a API, consulte:
1. A documentação Swagger: http://localhost:3000/api/docs
2. O arquivo `SWAGGER_DOCUMENTATION.md`
3. O arquivo `API_ENDPOINTS_SUMMARY.json`

---

**Versão da API**: 1.0.0  
**Data da Documentação**: 24/04/2026  
**Status**: ✅ Produção
