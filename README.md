# REDE FAB LAB PRESIDENTE PRUDENTE

Sistema web para administrar o Fab Lab da escola, feito com **Node.js, HTML e CSS**, com persistência local em JSON ou **Supabase** (PostgreSQL) em produção. Pronto para hospedar na **Vercel**.

## Como executar

1. Tenha o **Node.js 18 ou superior** instalado.
2. Dê um duplo clique em **`start.bat`** (Windows) ou execute:

```bash
npm start
```

3. Acesse **http://localhost:3000**.

Se a porta 3000 estiver ocupada, execute com outra porta:

```bash
set PORT=3001 && node server.js
```

> Sem as variáveis do Supabase, o sistema usa o arquivo local **`data/db.json`**.
> Esse modo serve apenas para uso local: na Vercel o disco não é permanente.

## Hospedar na Vercel + Supabase

O sistema já está preparado para a Vercel: a API fica em **`api/[...path].js`** e os arquivos do site em **`public/`**. O banco de produção fica no **Supabase** (PostgreSQL).

### 1. Criar o banco no Supabase

1. Entre em <https://supabase.com> e crie um projeto (guarde a senha do banco).
2. Abra **SQL Editor > New query**.
3. Copie todo o conteúdo de **`supabase/schema.sql`** e execute (**Run**).
   - Isso cria as tabelas `users`, `machines`, `bookings`, `student_visits` e `visit_requests`, os índices e o RLS.
   - Se o projeto Supabase **já existia** antes dos pedidos de envio, rode apenas **`supabase/migration-visit-requests.sql`**.

### 2. Copiar as credenciais

No Supabase, abra **Project Settings > API** e copie:

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | **Project URL** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys > `service_role`** (clique em revelar) |

> ⚠️ A chave `service_role` dá acesso total ao banco. Use **somente** nas variáveis de ambiente do servidor na Vercel. Nunca coloque essa chave em HTML, JS do navegador ou repositório público.

Gere também um segredo para as sessões:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Publicar na Vercel

**Opção A — pelo site:**

1. Suba o projeto para um repositório no GitHub.
2. Em <https://vercel.com/new>, importe o repositório.
3. Em **Environment Variables**, cadastre:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |
| `SESSION_SECRET` | segredo gerado no passo anterior |
| `APP_TIMEZONE` | `America/Sao_Paulo` (opcional; já é o padrão) |
| `DEVICE_TOKEN` | token do ESP32 (o mesmo do firmware) |

4. Clique em **Deploy**. Não é necessário configurar build: a Vercel detecta `api/` e `public/` automaticamente. O arquivo **`vercel.json`** já cria as rotas `/app`, `/admin` e `/admin/dashboard`.

**Opção B — pela linha de comando:**

```bash
npx vercel
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add SESSION_SECRET
npx vercel env add APP_TIMEZONE
npx vercel env add DEVICE_TOKEN
npx vercel --prod
```

### 4. Primeiro acesso em produção

- Na primeira requisição, o servidor cria automaticamente as contas e as máquinas iniciais **se as tabelas estiverem vazias**:
  - professor: `professor` / `fablab123`
  - admin: `admin` / `admin123`
- Entre em **`/admin`** e troque as duas senhas na aba **Usuários**.
- A agenda usa o fuso `America/Sao_Paulo` por padrão. Para outro fuso, defina `APP_TIMEZONE` (o nome `TZ` é reservado na Vercel).

### Testar o Supabase no computador

1. Copie **`.env.example`** para **`.env`** e preencha os valores.
2. Execute com o carregamento do arquivo (Node.js 20.6 ou superior):

```bash
npm run start:env
```

O console mostra `Banco: Supabase` quando a conexão está configurada e `Banco: JSON local` caso contrário.

### Como funciona a persistência

- **Com** `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: usa o Supabase.
- **Sem** essas variáveis: usa `data/db.json` (ideal para desenvolver offline).
- As senhas são armazenadas com hash `scrypt` + salt.
- A sessão é um cookie assinado (HMAC), então funciona em serverless sem guardar sessões em memória.

### Problemas comuns em produção

Se as páginas abrem, mas o login retorna **erro interno**, abra no navegador:

```
https://SEU-SITE.vercel.app/api/health
```

A resposta mostra se as variáveis chegaram ao servidor (`checks`) e qual foi o erro do banco. Causas mais comuns:

| Sintoma | Correção |
|---|---|
| `supabaseUrl: false` ou `serviceRoleKey: false` | cadastre as variáveis na Vercel e faça **Redeploy** |
| `relation "public.users" does not exist` | execute **`supabase/schema.sql`** no SQL Editor do Supabase |
| `Could not find the table ... in the schema cache` | as tabelas não existem nesse projeto: execute **`supabase/schema.sql`** |
| `row-level security` / `42501` | use a chave **`service_role`**, não a `anon` |
| `Invalid API key` / `PGRST301` | copie novamente a chave `service_role` |
| `Invalid path` / `PGRST125` | em `SUPABASE_URL` use só `https://SEU-PROJETO.supabase.co` (sem `/rest/v1`) |

Variáveis de ambiente só entram em vigor em um **novo deploy**.

## Acessos iniciais

| Perfil | Usuário | Senha |
|---|---|---|
| Professor | `professor` | `fablab123` |
| Administrador | `admin` | `admin123` |

> **Importante:** entre na área administrativa e redefina as senhas iniciais na aba **Usuários** (botão **Senha**). O sistema não deixa a senha do administrador exposta nas telas de login.

- Login do professor: **http://localhost:3000**
- Login administrativo: **http://localhost:3000/admin**

## O que o sistema faz

### Professor
- Login com usuário e senha.
- Agenda do Fab Lab com **4 semanas** (semana atual + 3 semanas seguintes).
- Grade com os horários disponíveis de **segunda a sexta-feira**.
- Intervalos de **20 minutos às 08:40 e às 15:50**, respeitados pela grade.
- Seleção de vários blocos consecutivos de **30, 40 ou 50 minutos** para reservar a sala.
- Visualização dos horários já ocupados e das reservas da semana.
- Cancelamento das próprias reservas.
- Pop-up de agendamento com:
  - turma/sala;
  - quantidade de alunos;
  - motivo;
  - necessidade de máquina e qual equipamento.
- Botão **+ Adicionar aluno** com pop-up de 4 campos:
  - sala/turma (6º A ao 3º C);
  - propósito (projeto, pesquisa etc.);
  - quantidade de alunos;
  - tempo médio de permanência no Fab Lab.
- O envio fica aguardando aprovação do administrador no ESP32.
- Pop-up automático com o resultado (aceito ou recusado), mesmo que o professor esteja em outra aba.
- Lista dos alunos aceitos, com opção de excluir registros.

### Administrador
- Login separado em **`/admin`**.
- Visão geral das próximas reservas e dos últimos envios.
- Lista de todos os agendamentos, com cancelamento.
- Lista dos alunos enviados **hoje** (histórico diário).
- Notificação sonora quando um professor reserva ou envia alunos.
- Decisão de envio pelo ESP32: tela azul com **ACEITAR** (verde) e **DECLINAR** (vermelho).
- Cadastro, renomeação e remoção de máquinas.
- Cadastro e exclusão de contas de professores.
- Redefinição de senha de qualquer usuário.
- Acesso à agenda normal pelo botão **Ir para a agenda**.

## Tela do ESP32 (aprovação de envios)

O firmware em `projetosmarthouse/projetosmarthouse.ino` transforma o ESP32 com tela TFT touch no dispositivo de aprovação:

- Consulta **`GET /api/device/visit-requests/pending`** a cada **3 segundos**, enviando o cabeçalho `X-Device-Token`.
- Quando há pedido pendente, abre uma tela azul com:
  - **“Professor XXXXX quer enviar XX alunos.”**
  - **“Horas: XX:XX”**
  - **DECLINAR** (vermelho, à esquerda) e **ACEITAR** (verde, à direita).
- O toque envia **`POST /api/device/visit-requests/:id/decision`** com `{"decision":"accept"}` ou `{"decision":"decline"}`.
- Aceitar cria o registro normal de alunos enviados; recusar apenas fecha o pedido.
- Depois da decisão, a tela mostra o resultado e volta para a tela anterior.

No firmware e na Vercel, use o **mesmo** valor de `DEVICE_TOKEN`. Sem ele, os endpoints do dispositivo respondem **503**.

## Horários configurados

| Dia | Manhã | Tarde |
|---|---|---|
| Segunda-feira | 08:00 – 12:20 | 13:20 – 17:00 |
| Terça-feira | 09:20 – 12:20 | 13:20 – 18:20 |
| Quarta-feira | 08:00 – 10:40 | 13:20 – 17:00 |
| Quinta-feira | 09:20 – 12:20 | 13:20 – 18:20 |
| Sexta-feira | 08:00 – 12:20 | 13:20 – 17:00 |

**Intervalos de 20 minutos:** 08:40 – 09:00 e 15:50 – 16:10. Nenhum bloco de reserva atravessa um intervalo; a grade é dividida em segmentos antes de gerar os blocos.

**Manhã:** os blocos de 50 minutos são cortados a partir das **07:00** e só aparecem a partir do horário de entrada do dia (08:00 ou 09:20). O primeiro bloco é o pedaço que sobra entre a entrada e o próximo corte de 50 min. Depois de um intervalo, o corte recomeça no fim do intervalo (09:00).

Exemplos:
- Segunda/quarta/sexta (entrada 08:00): **08:00 – 08:40 (40 min)**, intervalo, **09:00 – 09:50**, 09:50 – 10:40, 10:40 – 11:30, 11:30 – 12:20.
- Terça/quinta (entrada 09:20): **09:20 – 09:50 (30 min)**, **09:50 – 10:40**, 10:40 – 11:30, 11:30 – 12:20.

**Tarde:** os blocos de 50 minutos começam no início do turno (13:20) e recomeçam no fim do intervalo (16:10). Quando sobram pelo menos **40 minutos** ao final de um segmento, esse resto é oferecido como um bloco de 40 min.

Para alterar os intervalos, edite a constante `BREAKS` no arquivo **`server.js`**.

Para alterar os dias e horários, edite o objeto `AVAILABILITY` no arquivo **`server.js`**.

## Estrutura do projeto

```
fablab/
├── server.js                 # servidor HTTP, API e regras de agenda
├── api/
│   └── [...path].js          # função serverless da Vercel (/api/*)
├── lib/
│   ├── store.js              # banco: JSON local ou Supabase
│   └── session.js            # cookie de sessão assinado (HMAC)
├── supabase/
│   └── schema.sql            # tabelas, índices e RLS do Supabase
├── vercel.json               # rotas /app, /admin e /admin/dashboard
├── .env.example              # modelo das variáveis de ambiente
├── package.json
├── start.bat                 # inicialização no Windows
├── README.md
├── data/
│   └── db.json               # banco local (criado automaticamente)
└── public/
    ├── index.html            # login do professor
    ├── app.html              # agenda e envio de alunos
    ├── admin.html            # login administrativo
    ├── admin-dashboard.html  # painel administrativo
    ├── css/styles.css
    ├── img/logo.svg
    └── js/
        ├── common.js
        ├── login.js
        ├── app.js
        ├── admin-login.js
        └── admin.js
```

## Dados e backup

- **Local (sem Supabase):** todos os dados ficam em **`data/db.json`**. Para backup, copie esse arquivo.
- **Produção (Supabase):** os dados ficam nas tabelas do projeto Supabase. Use **Database > Backups** ou `pg_dump` para backups.
- As senhas são armazenadas com hash `scrypt` e salt, não em texto puro.
- As sessões são cookies assinados com `SESSION_SECRET` e duram 8 horas. Trocar a senha de um usuário invalida as sessões antigas dele.

## Observações

- Para expor na internet, use HTTPS (a Vercel já fornece).
- A chave `SUPABASE_SERVICE_ROLE_KEY` é usada apenas no servidor; nunca a exponha no navegador.
- Com RLS ativado e sem políticas públicas, as chaves `anon`/`authenticated` não acessam os dados.
- Máquinas renomeadas no painel admin são atualizadas também nos agendamentos existentes.
