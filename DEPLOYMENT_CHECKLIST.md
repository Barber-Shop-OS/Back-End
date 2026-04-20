# ✅ Deployment Checklist — BarberOS v2.0

## 🔍 PRÉ-DEPLOYMENT (Antes de qualquer mudança)

### Backup e Segurança
- [ ] Backup completo do banco de dados MySQL
  ```bash
  mysqldump -u root -p barbershop_db > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Backup dos arquivos de código (git commit)
  ```bash
  git status
  git add .
  git commit -m "Pre-deployment backup v2.0"
  git push
  ```
- [ ] Verificar que `.env` tem credenciais corretas
  ```bash
  echo "DB_HOST=${DB_HOST}, DB_USER=${DB_USER}, PORT=${PORT}"
  ```

### Ambiente
- [ ] Node.js v14+ instalado
  ```bash
  node --version  # v14.0.0 ou maior
  npm --version   # 6.0.0 ou maior
  ```
- [ ] MySQL 5.7+ funcionando
  ```bash
  mysql --version
  ```
- [ ] Git atualizado
  ```bash
  git status
  ```

---

## 📦 INSTALAÇÃO (Novos pacotes necessários)

### Passo 1: Instalar Sequelize CLI
```bash
npm install --save-dev sequelize-cli

# Verificar
npx sequelize-cli --version
```

### Passo 2: Verificar dependências existentes
```bash
npm install

# Verificar
npm list | grep sequelize
npm list | grep bcryptjs
npm list | grep jsonwebtoken
```

**Esperado:**
```
├── sequelize@6.37.6
├── bcryptjs@3.0.2
├── jsonwebtoken@9.0.2
├── mysql2@3.13.0
└── cors@2.8.5
```

---

## 🔧 PRÉ-MIGRAÇÃO (Verificações)

### Passo 1: Verificar arquivo .sequelizerc
```bash
# Verificar que o arquivo existe
test -f .sequelizerc && echo "✅ .sequelizerc existe" || echo "❌ Falta .sequelizerc"

# Ver conteúdo
cat .sequelizerc
```

### Passo 2: Verificar arquivo sequelize-config.js
```bash
# Verificar que o arquivo existe
test -f src/config/sequelize-config.js && echo "✅ sequelize-config.js existe" || echo "❌ Falta sequelize-config.js"

# Ver conteúdo
cat src/config/sequelize-config.js
```

### Passo 3: Verificar migrações
```bash
# Verificar que as 8 migrações existem
ls -la src/migrations/ | grep -c "create-"
# Esperado: 8

# Listar todas
ls -la src/migrations/
```

### Passo 4: Verificar que banco de dados está acessível
```bash
mysql -u root -p -e "SHOW DATABASES;"
```

**Esperado:** Deve listar `barbershop_db` (ou seu banco configurado)

---

## 🚀 MIGRAÇÃO (Executar updates)

### Passo 1: Listar status das migrações
```bash
npx sequelize-cli db:migrate:status
```

**Esperado (antes de migrar):**
```
down  20260420000001-create-users.js
down  20260420000002-create-addresses.js
down  20260420000003-create-barbershops.js
down  20260420000004-create-branches.js
down  20260420000005-create-barbers.js
down  20260420000006-create-services.js
down  20260420000007-create-appointments.js
down  20260420000008-create-payments.js
```

### Passo 2: Executar migrações
```bash
npx sequelize-cli db:migrate
```

**Esperado:**
```
Sequelize CLI [Node: 14.x.x, CLI: 6.x.x, ORM: 6.37.x]

Loaded configuration file "src/config/sequelize-config.js".
Using environment "development".
== 20260420000001-create-users: migrating =======
== 20260420000001-create-users: migrated (0.XXs)
== 20260420000002-create-addresses: migrating =======
== 20260420000002-create-addresses: migrated (0.XXs)
[... continues para todas as 8 migrações ...]
== 20260420000008-create-payments: migrated (0.XXs)
```

### Passo 3: Verificar status após migração
```bash
npx sequelize-cli db:migrate:status
```

**Esperado (após migrar):**
```
up  20260420000001-create-users.js
up  20260420000002-create-addresses.js
up  20260420000003-create-barbershops.js
up  20260420000004-create-branches.js
up  20260420000005-create-barbers.js
up  20260420000006-create-services.js
up  20260420000007-create-appointments.js
up  20260420000008-create-payments.js
```

---

## 🔍 PÓS-MIGRAÇÃO (Verificações)

### Passo 1: Verificar tabelas no banco de dados
```bash
mysql -u root -p barbershop_db -e "SHOW TABLES;"
```

**Esperado (9 tabelas):**
```
+------------------------+
| Tables_in_barbershop_db|
+------------------------+
| addresses              |
| appointments           |
| barbershops            |
| barbers                |
| branches               |
| payments               |
| sequelize_meta         |
| services               |
| users                  |
+------------------------+
```

### Passo 2: Verificar estrutura de algumas tabelas
```bash
# Verificar users
mysql -u root -p barbershop_db -e "DESCRIBE users;"

# Verificar appointments
mysql -u root -p barbershop_db -e "DESCRIBE appointments;"

# Verificar payments
mysql -u root -p barbershop_db -e "DESCRIBE payments;"
```

### Passo 3: Verificar constraints
```bash
# Verificar foreign keys
mysql -u root -p barbershop_db -e "
  SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = 'barbershop_db' AND REFERENCED_TABLE_NAME IS NOT NULL;
"
```

**Esperado:** Deve listar todos os FK entre as tabelas

---

## 🧪 TESTES FUNCIONAIS

### Teste 1: Criar usuário (POST /api/auth/register)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@test.com",
    "password": "senha123",
    "role": "cliente"
  }'
```

**Esperado (200):**
```json
{
  "message": "Usuário cadastrado com sucesso",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@test.com",
    "role": "cliente"
  }
}
```

**❌ NÃO deve conter:** `password` na resposta

### Teste 2: Login (POST /api/auth/login)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@test.com",
    "password": "senha123"
  }'
```

**Esperado (200):**
```json
{
  "message": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Capturar:** O token para os próximos testes

### Teste 3: Obter perfil (GET /api/auth/me)
```bash
TOKEN="token_do_teste_2"
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Esperado (200):**
```json
{
  "id": 1,
  "name": "João Silva",
  "email": "joao@test.com",
  "role": "cliente"
}
```

### Teste 4: Sem token (GET /api/user)
```bash
curl -X GET http://localhost:3000/api/user
```

**Esperado (401):**
```json
{
  "message": "Token não fornecido"
}
```

### Teste 5: Token inválido (GET /api/user)
```bash
curl -X GET http://localhost:3000/api/user \
  -H "Authorization: Bearer invalid_token"
```

**Esperado (401):**
```json
{
  "message": "Token inválido ou expirado"
}
```

### Teste 6: Acesso negado (GET /api/user - sem role)
```bash
TOKEN="token_do_teste_2"  # Cliente token
curl -X GET http://localhost:3000/api/user \
  -H "Authorization: Bearer $TOKEN"
```

**Esperado (403):**
```json
{
  "message": "Acesso restrito. Permissão necessária: admin"
}
```

### Teste 7: Atualizar senha (PUT /api/user/:id)
```bash
TOKEN="token_do_teste_2"
curl -X PUT http://localhost:3000/api/user/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "João Silva",
    "password": "nova_senha123"
  }'
```

**Esperado (200):**
```json
{
  "message": "Usuário atualizado com sucesso",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@test.com",
    "role": "cliente"
  }
}
```

**Verificar:** Senha foi realmente hashada (fazer login com nova senha)

---

## 🐛 TROUBLESHOOTING

### Problema: "Table 'barbershop_db.users' doesn't exist"
```bash
# Solução: Executar migrações novamente
npx sequelize-cli db:migrate:undo:all
npx sequelize-cli db:migrate
```

### Problema: "Access denied for user 'root'"
```bash
# Verificar credenciais em .env
cat .env | grep DB_

# Testar conexão direta
mysql -u root -p -h localhost -e "SELECT 1;"
```

### Problema: "sequelize-cli not found"
```bash
# Solução
npm install -D sequelize-cli
```

### Problema: "Cannot find module"
```bash
# Solução
npm install
npm audit fix
```

### Problema: "Port 3000 already in use"
```bash
# Liberar porta
sudo lsof -i :3000
sudo kill -9 <PID>

# Ou usar outra porta
PORT=3001 npm run dev
```

### Problema: Password ainda aparecendo nas respostas
```bash
# Verificar que controllers têm:
# attributes: { exclude: ['password'] }

# Procurar por:
grep -r "exclude: \['password'\]" src/

# Deve retornar múltiplas ocorrências
```

---

## ✅ PÓS-DEPLOYMENT (Verificações Finais)

### Health Check
- [ ] Servidor iniciando sem erros
  ```bash
  npm run dev
  # Verificar: "Server listening on port 3000"
  ```

- [ ] Banco de dados conectando
  ```bash
  # Verificar no log: "Database connection successful"
  ```

- [ ] Todos os testes passando
  ```bash
  npm test
  # Esperado: All tests passing
  ```

### Segurança
- [ ] Password hashing ativado
  ```bash
  grep -r "bcrypt.hash" src/controllers/
  grep -r "bcrypt.compare" src/controllers/
  ```

- [ ] Password exclusão configurada
  ```bash
  grep -r "exclude: \['password'\]" src/
  # Deve ter múltiplas ocorrências
  ```

- [ ] Auth middleware aplicado
  ```bash
  grep -r "authMiddleware" src/routes/
  ```

- [ ] Roles aplicados
  ```bash
  grep -r "roleMiddleware" src/routes/
  ```

### Funcionalidade
- [ ] Registro funciona
- [ ] Login funciona
- [ ] Endpoints protegidos requerem auth
- [ ] Roles são respeitados
- [ ] Mensagens em português

---

## 🎯 Próximos Passos Após Deploy

1. **Comunicar a equipe**
   - [ ] Notificar sobre nova versão
   - [ ] Compartilhar documentação
   - [ ] Treinar equipe (se necessário)

2. **Monitorar**
   - [ ] Verificar logs continuamente
   - [ ] Monitorar performance
   - [ ] Anotar erros para correção

3. **Testes Adicionais**
   - [ ] Testes de carga
   - [ ] Testes de segurança
   - [ ] Testes de integração end-to-end

4. **Documentação**
   - [ ] Atualizar README.md
   - [ ] Criar guia de API
   - [ ] Documentar mudanças

---

## 📋 Resumo do Checklist

| Fase | Tarefas | Status |
|------|---------|--------|
| Pré-Deployment | 5 | ☐ ☐ ☐ ☐ ☐ |
| Instalação | 2 | ☐ ☐ |
| Pré-Migração | 4 | ☐ ☐ ☐ ☐ |
| Migração | 3 | ☐ ☐ ☐ |
| Pós-Migração | 3 | ☐ ☐ ☐ |
| Testes Funcionais | 7 | ☐ ☐ ☐ ☐ ☐ ☐ ☐ |
| Verificação Final | 4 | ☐ ☐ ☐ ☐ |
| **TOTAL** | **28** | ☐ |

---

## 🆘 Contato de Suporte

Se algo der errado:

1. **Verificar logs:**
   ```bash
   tail -f logs/app.log
   ```

2. **Reverter mudanças:**
   ```bash
   npx sequelize-cli db:migrate:undo:all
   git revert HEAD
   ```

3. **Restaurar backup:**
   ```bash
   mysql -u root -p barbershop_db < backup_YYYYMMDD_HHMMSS.sql
   ```

4. **Consultar documentação:**
   - IMPLEMENTATION_GUIDE.md
   - ARCHITECTURE.md
   - REFACTORING_SUMMARY.md

---

**Versão:** 2.0.0  
**Data:** 20 de abril de 2026  
**Checklist Versão:** 1.0  
**Status:** ✅ Pronto para usar
