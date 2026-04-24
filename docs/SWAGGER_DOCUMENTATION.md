# Documentação da API BarberOS

## 📋 Visão Geral

**API REST para gestão de barbearias** - Sistema SaaS multi-barbearia com suporte a múltiplas filiais, agendamentos, pagamentos e gestão de barbeiros.

- **Versão**: 1.0.0
- **Base URL**: `http://localhost:3000/api` (desenvolvimento)
- **Autenticação**: JWT Bearer Token
- **Documentação Swagger**: http://localhost:3000/api/docs

---

## 🔐 Autenticação

Todos os endpoints protegidos requerem um token JWT no header:

```bash
Authorization: Bearer <seu_token_jwt>
```

### Obtenção do Token

1. Registre um novo usuário com `POST /auth/register`
2. Ou faça login com `POST /auth/login`
3. Você receberá um token JWT para usar nas requisições autenticadas

---

## 📚 Endpoints por Módulo

### 🔓 AUTH - Autenticação

#### 1. Registrar Novo Usuário
- **Método**: `POST`
- **Path**: `/auth/register`
- **Autenticação**: Não requerida
- **Rate Limit**: Sim (limitado)
- **Body**:
  ```json
  {
    "name": "Carlos Silva",
    "email": "carlos@barber.com",
    "password": "senha123"
  }
  ```
- **Respostas**:
  - `201`: Usuário cadastrado com sucesso
  - `400`: Dados inválidos
  - `409`: E-mail já cadastrado

#### 2. Login de Usuário
- **Método**: `POST`
- **Path**: `/auth/login`
- **Autenticação**: Não requerida
- **Rate Limit**: Sim (limitado)
- **Body**:
  ```json
  {
    "email": "carlos@barber.com",
    "password": "senha123"
  }
  ```
- **Respostas**:
  - `200`: Login realizado com sucesso
  - `400`: Campos obrigatórios ausentes
  - `401`: Credenciais inválidas

#### 3. Obter Dados do Usuário Autenticado
- **Método**: `GET`
- **Path**: `/auth/me`
- **Autenticação**: Requerida ✓
- **Respostas**:
  - `200`: Dados do usuário retornados
  - `401`: Token inválido ou expirado
  - `404`: Usuário não encontrado

---

### 👥 USER - Gestão de Usuários

#### 1. Listar Usuários
- **Método**: `GET`
- **Path**: `/user`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade de itens por página
- **Respostas**:
  - `200`: Lista de usuários retornada
  - `401`: Usuário não autenticado
  - `403`: Acesso restrito

#### 2. Obter Usuário por ID
- **Método**: `GET`
- **Path**: `/user/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do usuário
- **Respostas**:
  - `200`: Usuário encontrado
  - `401`: Usuário não autenticado
  - `404`: Usuário não encontrado

#### 3. Atualizar Usuário
- **Método**: `PUT`
- **Path**: `/user/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do usuário
- **Body**:
  ```json
  {
    "name": "Carlos Souza",
    "email": "carlos.souza@barber.com",
    "password": "novaSenha123",
    "role": "cliente"
  }
  ```
- **Respostas**:
  - `200`: Usuário atualizado com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `404`: Usuário não encontrado

#### 4. Deletar Usuário
- **Método**: `DELETE`
- **Path**: `/user/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`
- **Path Parameters**:
  - `id` (integer): ID do usuário
- **Respostas**:
  - `200`: Usuário deletado com sucesso
  - `401`: Usuário não autenticado
  - `403`: Acesso restrito
  - `404`: Usuário não encontrado

---

### 💈 BARBER - Gestão de Barbeiros

#### 1. Listar Barbeiros
- **Método**: `GET`
- **Path**: `/barber`
- **Autenticação**: Não requerida
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade por página
- **Respostas**:
  - `200`: Lista de barbeiros retornada

#### 2. Obter Barbeiro por ID
- **Método**: `GET`
- **Path**: `/barber/{id}`
- **Autenticação**: Não requerida
- **Path Parameters**:
  - `id` (integer): ID do barbeiro
- **Respostas**:
  - `200`: Barbeiro encontrado
  - `404`: Barbeiro não encontrado

#### 3. Criar Barbeiro
- **Método**: `POST`
- **Path**: `/barber`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Body**:
  ```json
  {
    "user_id": 2,
    "branch_id": 1,
    "bio": "Especialista em corte social"
  }
  ```
- **Respostas**:
  - `201`: Barbeiro criado com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão

#### 4. Atualizar Barbeiro
- **Método**: `PUT`
- **Path**: `/barber/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID do barbeiro
- **Body**:
  ```json
  {
    "branch_id": 1,
    "bio": "Especialista em fade e design de barba"
  }
  ```
- **Respostas**:
  - `200`: Barbeiro atualizado com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Barbeiro não encontrado

#### 5. Deletar Barbeiro
- **Método**: `DELETE`
- **Path**: `/barber/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID do barbeiro
- **Respostas**:
  - `200`: Barbeiro deletado com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Barbeiro não encontrado

---

### 🛠️ SERVICE - Gestão de Serviços

#### 1. Listar Serviços
- **Método**: `GET`
- **Path**: `/services`
- **Autenticação**: Não requerida
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade por página
- **Respostas**:
  - `200`: Lista de serviços retornada

#### 2. Obter Serviço por ID
- **Método**: `GET`
- **Path**: `/services/{id}`
- **Autenticação**: Não requerida
- **Path Parameters**:
  - `id` (integer): ID do serviço
- **Respostas**:
  - `200`: Serviço encontrado
  - `404`: Serviço não encontrado

#### 3. Criar Serviço
- **Método**: `POST`
- **Path**: `/services`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Body**:
  ```json
  {
    "name": "Corte completo",
    "description": "Corte e finalização",
    "price": 45,
    "duration": 40,
    "barbershop_id": 1
  }
  ```
- **Respostas**:
  - `201`: Serviço criado com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão

#### 4. Atualizar Serviço
- **Método**: `PUT`
- **Path**: `/services/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID do serviço
- **Body**:
  ```json
  {
    "name": "Corte premium",
    "description": "Corte, barba e finalização",
    "price": 65,
    "duration": 60,
    "barbershop_id": 1
  }
  ```
- **Respostas**:
  - `200`: Serviço atualizado com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Serviço não encontrado

#### 5. Deletar Serviço
- **Método**: `DELETE`
- **Path**: `/services/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID do serviço
- **Respostas**:
  - `200`: Serviço deletado com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Serviço não encontrado

---

### 📅 APPOINTMENT - Gestão de Agendamentos

#### 1. Listar Agendamentos
- **Método**: `GET`
- **Path**: `/appointment`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`, `barbeiro`
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade por página
  - `status` (string): Status do agendamento (pendente, confirmado, cancelado)
- **Respostas**:
  - `200`: Lista de agendamentos retornada
  - `401`: Usuário não autenticado
  - `403`: Sem permissão

#### 2. Obter Agendamento por ID
- **Método**: `GET`
- **Path**: `/appointment/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do agendamento
- **Respostas**:
  - `200`: Agendamento encontrado
  - `401`: Usuário não autenticado
  - `404`: Agendamento não encontrado

#### 3. Criar Agendamento
- **Método**: `POST`
- **Path**: `/appointment`
- **Autenticação**: Requerida ✓
- **Body**:
  ```json
  {
    "user_id": 1,
    "barber_id": 1,
    "service_id": 1,
    "branch_id": 1,
    "appointment_date": "2026-06-10T14:00:00.000Z",
    "status": "pendente"
  }
  ```
- **Respostas**:
  - `201`: Agendamento criado com sucesso
  - `400`: Dados inválidos ou barbeiro fora da filial
  - `401`: Usuário não autenticado
  - `404`: Entidade relacionada não encontrada

#### 4. Atualizar Status do Agendamento
- **Método**: `PUT`
- **Path**: `/appointment/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do agendamento
- **Body**:
  ```json
  {
    "status": "confirmado"
  }
  ```
- **Valores válidos para status**: `pendente`, `confirmado`, `cancelado`
- **Respostas**:
  - `200`: Status atualizado com sucesso
  - `400`: Status inválido
  - `401`: Usuário não autenticado
  - `404`: Agendamento não encontrado

#### 5. Deletar Agendamento
- **Método**: `DELETE`
- **Path**: `/appointment/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do agendamento
- **Respostas**:
  - `200`: Agendamento deletado com sucesso
  - `401`: Usuário não autenticado
  - `404`: Agendamento não encontrado

---

### 💳 PAYMENT - Gestão de Pagamentos

#### 1. Registrar Pagamento
- **Método**: `POST`
- **Path**: `/payment`
- **Autenticação**: Requerida ✓
- **Rate Limit**: Sim (limitado)
- **Body**:
  ```json
  {
    "appointment_id": 1,
    "amount": 80,
    "method": "PIX"
  }
  ```
- **Métodos válidos**: `PIX`, `CASH`
- **Respostas**:
  - `201`: Pagamento registrado com sucesso
  - `400`: Dados de pagamento inválidos
  - `401`: Usuário não autenticado
  - `404`: Agendamento não encontrado
  - `409`: Pagamento já registrado

#### 2. Obter Pagamento por ID
- **Método**: `GET`
- **Path**: `/payment/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do pagamento
- **Respostas**:
  - `200`: Pagamento encontrado com sucesso
  - `401`: Usuário não autenticado
  - `404`: Pagamento não encontrado

#### 3. Obter Pagamento por ID de Agendamento
- **Método**: `GET`
- **Path**: `/payment/appointment/{appointment_id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `appointment_id` (integer): ID do agendamento
- **Respostas**:
  - `200`: Pagamento encontrado com sucesso
  - `401`: Usuário não autenticado
  - `404`: Pagamento não encontrado para o agendamento

#### 4. Atualizar Status do Pagamento
- **Método**: `PUT`
- **Path**: `/payment/{id}/status`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`, `barbeiro`
- **Rate Limit**: Sim (limitado)
- **Path Parameters**:
  - `id` (integer): ID do pagamento
- **Body**:
  ```json
  {
    "status": "PAID"
  }
  ```
- **Valores válidos para status**: `PAID`, `FAILED`
- **Respostas**:
  - `200`: Status do pagamento atualizado com sucesso
  - `400`: Status inválido
  - `401`: Usuário não autenticado
  - `403`: Sem permissão para atualizar
  - `404`: Pagamento não encontrado

---

### 🏪 BARBERSHOP - Gestão de Barbearias

#### 1. Listar Barbearias
- **Método**: `GET`
- **Path**: `/barbershop`
- **Autenticação**: Não requerida
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade por página
  - `name` (string): Nome parcial da barbearia
  - `city` (string): Cidade da filial
- **Respostas**:
  - `200`: Lista de barbearias retornada

#### 2. Obter Barbearia por ID
- **Método**: `GET`
- **Path**: `/barbershop/{id}`
- **Autenticação**: Não requerida
- **Path Parameters**:
  - `id` (integer): ID da barbearia
- **Respostas**:
  - `200`: Barbearia encontrada
  - `404`: Barbearia não encontrada

#### 3. Criar Barbearia
- **Método**: `POST`
- **Path**: `/barbershop`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Body**:
  ```json
  {
    "name": "Barber Prime"
  }
  ```
- **Respostas**:
  - `201`: Barbearia criada com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `409`: Nome já existe para o mesmo owner

#### 4. Atualizar Barbearia
- **Método**: `PUT`
- **Path**: `/barbershop/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID da barbearia
- **Body**:
  ```json
  {
    "name": "Barber Prime Centro"
  }
  ```
- **Respostas**:
  - `200`: Barbearia atualizada com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão para editar esta barbearia
  - `404`: Barbearia não encontrada

#### 5. Deletar Barbearia
- **Método**: `DELETE`
- **Path**: `/barbershop/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID da barbearia
- **Respostas**:
  - `200`: Barbearia deletada com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Barbearia não encontrada

---

### 🏢 BRANCH - Gestão de Filiais

#### 1. Listar Filiais
- **Método**: `GET`
- **Path**: `/branch`
- **Autenticação**: Não requerida
- **Query Parameters**:
  - `page` (integer): Página atual
  - `pageSize` (integer): Quantidade por página
  - `barbershop_id` (integer): ID da barbearia
- **Respostas**:
  - `200`: Lista de filiais retornada

#### 2. Obter Filial por ID
- **Método**: `GET`
- **Path**: `/branch/{id}`
- **Autenticação**: Não requerida
- **Path Parameters**:
  - `id` (integer): ID da filial
- **Respostas**:
  - `200`: Filial encontrada
  - `404`: Filial não encontrada

#### 3. Criar Filial
- **Método**: `POST`
- **Path**: `/branch`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Body**:
  ```json
  {
    "name": "Unidade Centro",
    "barbershop_id": 1,
    "cep": "01001000",
    "number": 100,
    "complement": "Sala 2",
    "city": "São Paulo",
    "state": "SP"
  }
  ```
- **Respostas**:
  - `201`: Filial criada com sucesso
  - `400`: Dados inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão para gerenciar esta filial
  - `404`: Barbearia não encontrada

#### 4. Atualizar Filial
- **Método**: `PUT`
- **Path**: `/branch/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID da filial
- **Body**:
  ```json
  {
    "name": "Unidade Centro Premium",
    "cep": "01001000",
    "number": 120,
    "city": "São Paulo",
    "state": "SP"
  }
  ```
- **Respostas**:
  - `200`: Filial atualizada com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Filial não encontrada

#### 5. Deletar Filial
- **Método**: `DELETE`
- **Path**: `/branch/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID da filial
- **Respostas**:
  - `200`: Filial deletada com sucesso
  - `401`: Usuário não autenticado
  - `403`: Sem permissão
  - `404`: Filial não encontrada

---

### 📍 ADDRESS - Gestão de Endereços

#### 1. Criar Endereço
- **Método**: `POST`
- **Path**: `/address`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Body**:
  ```json
  {
    "cep": "01001000",
    "number": 100,
    "complement": "Fundos",
    "city": "São Paulo",
    "state": "SP"
  }
  ```
- **Respostas**:
  - `201`: Endereço criado com sucesso
  - `400`: Campos de endereço inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão para criar endereço

#### 2. Obter Endereço por ID
- **Método**: `GET`
- **Path**: `/address/{id}`
- **Autenticação**: Requerida ✓
- **Path Parameters**:
  - `id` (integer): ID do endereço
- **Respostas**:
  - `200`: Endereço encontrado
  - `401`: Usuário não autenticado
  - `404`: Endereço não encontrado

#### 3. Atualizar Endereço
- **Método**: `PUT`
- **Path**: `/address/{id}`
- **Autenticação**: Requerida ✓
- **Perfil Necessário**: `admin`, `owner`
- **Path Parameters**:
  - `id` (integer): ID do endereço
- **Body**:
  ```json
  {
    "cep": "01001000",
    "number": 120,
    "complement": "Loja 1",
    "city": "São Paulo",
    "state": "SP"
  }
  ```
- **Respostas**:
  - `200`: Endereço atualizado com sucesso
  - `400`: Campos de endereço inválidos
  - `401`: Usuário não autenticado
  - `403`: Sem permissão para atualizar endereço
  - `404`: Endereço não encontrado

---

## 🔑 Perfis de Usuário

| Perfil | Descrição | Permissões |
|--------|-----------|-----------|
| `cliente` | Cliente que agenda serviços | Criar/visualizar próprios agendamentos |
| `barbeiro` | Profissional que oferece serviços | Visualizar agendamentos, atualizar pagamentos |
| `owner` | Proprietário da barbearia | Gerenciar filiais, barbeiros, serviços |
| `admin` | Administrador do sistema | Acesso completo |

---

## 📊 Códigos de Status HTTP

| Código | Significado |
|--------|-----------|
| `200` | OK - Requisição bem-sucedida |
| `201` | Created - Recurso criado com sucesso |
| `400` | Bad Request - Dados inválidos |
| `401` | Unauthorized - Não autenticado |
| `403` | Forbidden - Sem permissão |
| `404` | Not Found - Recurso não encontrado |
| `409` | Conflict - Recurso duplicado |
| `429` | Too Many Requests - Rate limit excedido |
| `500` | Internal Server Error - Erro do servidor |

---

## 🔄 Rate Limiting

Alguns endpoints possuem limitação de taxa para proteger a API:

- **Auth (Register/Login)**: 5 requisições por 15 minutos por IP
- **Payment**: 10 requisições por minuto por usuário
- **General API**: 100 requisições por minuto por IP

Quando o limite é excedido, você receberá um status `429 Too Many Requests`.

---

## 📝 Exemplo de Requisição Completa

### 1. Registrar Usuário

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

**Resposta (201)**:
```json
{
  "message": "Usuário cadastrado com sucesso",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "cliente"
  }
}
```

### 2. Fazer Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

**Resposta (200)**:
```json
{
  "message": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "cliente"
  }
}
```

### 3. Usar Token em Requisição Protegida

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Resposta (200)**:
```json
{
  "id": 1,
  "name": "João Silva",
  "email": "joao@example.com",
  "role": "cliente"
}
```

---

## 🚀 Próximas Etapas

1. Acesse http://localhost:3000/api/docs para visualizar o Swagger interativo
2. Teste os endpoints diretamente pela interface Swagger
3. Obtenha um token de autenticação
4. Use o token para acessar endpoints protegidos

---

## 📞 Suporte

Para dúvidas ou problemas, entre em contato com o time BarberOS em support@barberos.com
