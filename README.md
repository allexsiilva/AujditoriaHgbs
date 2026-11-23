# 🏥 HospAudit - Guia Completo de Instalação Manual

Este guia contém o passo a passo detalhado para realizar a instalação, configuração e execução manual do **HospAudit** no seu computador Windows, utilizando o **Node.js** para a aplicação e o **XAMPP (MySQL)** para o banco de dados.

---

## 📌 Sumário
1. [Pré-requisitos (Node.js + XAMPP)](#1-pré-requisitos)
2. [Configuração do Banco de Dados no XAMPP (MySQL)](#2-configuração-do-banco-de-dados-no-xampp-mysql)
3. [Criação e Importação do Banco de Dados (`hospaudit.sql`)](#3-criação-e-importação-do-banco-de-dados-hospauditsql)
4. [Instalação das Dependências (`npm install`)](#4-instalação-das-dependências-npm-install)
5. [Compilação e Execução Manual (`npm run build` e `node server.js`)](#5-compilação-e-execução-manual)
6. [Instalação Simplificada por Script (`instalar-manual.bat`)](#6-instalação-simplificada-por-script)

---

## 1. 📥 Pré-requisitos

### A. Instalação do Node.js
1. Acesse o site oficial do Node.js: **[https://nodejs.org/](https://nodejs.org/)**
2. Baixe a versão **LTS** (recomendada para a maioria dos usuários).
3. Execute o instalador baixado (`.msi`).
4. Clique em **Next / Avançar** em todas as telas, mantendo as opções padrão, e conclua a instalação.
5. Para verificar se o Node.js foi instalado corretamente:
   * Abra o Prompt de Comando (CMD) do Windows.
   * Digite `node -v` e pressione Enter.
   * Digite `npm -v` e pressione Enter.
   *(Se aparecerem números de versão como `v20.x.x` e `10.x.x`, o Node.js está pronto!)*

### B. Instalação e Ativação do XAMPP
1. Acesse o site do XAMPP: **[https://www.apachefriends.org/](https://www.apachefriends.org/)**
2. Baixe e instale o XAMPP para Windows.
3. Abra o **XAMPP Control Panel** no seu computador.
4. Clique no botão **Start** na linha do **MySQL** (e do **Apache**, caso queira utilizar o phpMyAdmin pelo navegador).

---

## 2. 🗄️ Configuração do Banco de Dados no XAMPP (MySQL)

1. Certifique-se de que o **MySQL** no XAMPP Control Panel está com o status verde (**Running**).
2. Abra o seu navegador (Chrome, Edge, Firefox, etc.) e acesse:
   👉 **[http://localhost/phpmyadmin](http://localhost/phpmyadmin)**
   *(Ou clique no botão "Admin" ao lado de MySQL no XAMPP Control Panel)*.

---

## 3. 📄 Criação e Importação do Banco de Dados (`hospaudit.sql`)

### Passo 1: Criar o Banco de Dados
1. No menu lateral esquerdo do phpMyAdmin, clique no botão **"Novo"** (ou na aba **"Databases"** no topo).
2. No campo **Nome do banco de dados**, digite exatamente:
   `hospaudit`
3. No campo de colação/charset, selecione:
   `utf8mb4_unicode_ci` (ou `utf8mb4_general_ci`).
4. Clique no botão **"Criar"**.

### Passo 2: Importar a Estrutura e Dados Padrão (`hospaudit.sql`)
1. No menu esquerdo do phpMyAdmin, selecione o banco de dados **`hospaudit`** recém-criado.
2. Na barra superior do phpMyAdmin, clique na aba **"Importar"**.
3. Clique no botão **"Escolher arquivo"** (ou *Browse*).
4. Navegue até a pasta onde está o projeto HospAudit e selecione o arquivo **`hospaudit.sql`**.
5. Role até o final da página e clique no botão **"Executar"** (ou *Import*).
6. Aguarde alguns segundos. Você receberá uma mensagem em verde confirmando que a importação foi executada com sucesso!

---

## 4. 📦 Instalação das Dependências (`npm install`)

1. Abra o **Prompt de Comando (CMD)** do Windows.
2. Navegue até a pasta do projeto HospAudit. Por exemplo:
   ```cmd
   cd C:\xampp\htdocs\hospaudit
   ```
   *(💡 **Dica fácil:** Abra a pasta do HospAudit no Windows Explorer, clique na barra de endereços no topo, digite `cmd` e aperte Enter. O terminal já abrirá direto na pasta!)*

3. Digite o seguinte comando e pressione Enter:
   ```cmd
   npm install
   ```
4. Aguarde a instalação das dependências ser concluída (isso leva de 1 a 2 minutos).

---

## 5. 🚀 Compilação e Execução Manual

### Passo 1: Compilar o Sistema (`npm run build`)
No Prompt de Comando (na pasta do projeto), execute:
```cmd
npm run build
```
*(Este comando compila os arquivos do frontend em React/Vite para a pasta `dist/` e empacota o servidor Node.js em `dist/server.cjs`)*.

### Passo 2: Sincronizar e Testar o Banco MySQL (`node sync-db.js`)
Para testar a conexão com o MySQL do XAMPP e sincronizar automaticamente todas as tabelas e dados:
```cmd
node sync-db.js
```
*(ou `npm run sync-db`)*. Este script verifica a conexão com o MySQL, cria o banco `hospaudit` se necessário, ajusta as colunas dinamicamente e sincroniza todas as tabelas sem erros de chave primária.

### Passo 3: Iniciar o Servidor (`node server.js`)
Assim que a compilação finalizar com sucesso, inicie o servidor com o comando:
```cmd
node server.js
```
*(Ou, se preferir, use `npm start`)*.

Você verá a confirmação no terminal:
```
[HospAudit] Servidor ativado via PM2/Node (executando dist/server.cjs)...
Server running on port 3000
```

### Passo 3: Acessar o HospAudit no Navegador
Abra seu navegador e acesse:
👉 **[http://localhost:3000](http://localhost:3000)**

**Credenciais Padrão de Acesso (Administrador Master):**
* **Usuário:** `admin`
* **Senha:** `admin`

---

## 6. ⚡ Instalação Simplificada por Script (`instalar-manual.bat`)

Se você quiser evitar digitar comandos no terminal, disponibilizamos o script **`instalar-manual.bat`**:

1. Vá até a pasta do HospAudit.
2. Dê **dois cliques** no arquivo **`instalar-manual.bat`**.
3. Ele fará o `npm install`, em seguida o `npm run build` e perguntará se você deseja iniciar o servidor imediatamente.

---

### 📋 Resumo dos Comandos Manuais

```cmd
# 1. Entrar na pasta do projeto
cd C:\caminho\da\pasta\hospaudit

# 2. Instalar dependências
npm install

# 3. Compilar a aplicação
npm run build

# 4. Iniciar o servidor de produção
node server.js
```

Se precisar rodar em modo de desenvolvimento com recarregamento automático das alterações de código:
```cmd
npm run dev
```
