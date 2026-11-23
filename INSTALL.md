# 🏥 HOSP-AUDIT - GUIA DEFINITIVO DE INSTALAÇÃO E EXECUÇÃO

Este guia contém as instruções passo a passo para instalar, configurar e colocar em funcionamento o sistema HospAudit no seu computador ou servidor local.

---

## 📋 Pré-requisitos
Antes de começar, certifique-se de ter os seguintes programas instalados no seu computador:

1. **Node.js (Versão 18 ou 20 LTS)**: [Download Node.js](https://nodejs.org/)
2. **XAMPP (para MySQL / phpMyAdmin)**: [Download XAMPP](https://www.apachefriends.org/)
3. **Git** (Opcional, para atualizar código): [Download Git](https://git-scm.com/)

---

## 🛠️ Passo a Passo de Instalação

### Passo 1: Iniciar o Banco de Dados MySQL no XAMPP
1. Abra o **XAMPP Control Panel**.
2. Clique no botão **Start** ao lado de **Apache** e **MySQL**.
3. Abra o navegador e acesse: [http://localhost/phpmyadmin](http://localhost/phpmyadmin)
4. Clique em **Novo** (coluna da esquerda) e crie um banco de dados com o nome: `hospaudit`
5. (Opcional) Clique na aba **Importar** no phpMyAdmin e selecione o arquivo `hospaudit.sql` localizado na pasta do projeto para carregar as tabelas iniciais.
> *Nota: Se você não importar o SQL, o servidor HospAudit criará e sincronizará todas as tabelas e dados automaticamente assim que for iniciado!*

---

### Passo 2: Instalar as Dependências do Sistema
Abra o prompt de comando (CMD ou PowerShell) na pasta do projeto e execute:

```bash
npm install
```

---

### Passo 3: Iniciar o Servidor HospAudit
No mesmo terminal, rode o comando:

```bash
npm run dev
```

O sistema iniciará na **Porta 3000**.
Acesse no seu navegador:

👉 **[http://localhost:3000](http://localhost:3000)**

---

## 👤 Credenciais Padrão de Acesso

| Perfil | Usuário / E-mail | Senha |
| :--- | :--- | :--- |
| **Administrador Master** | `admin` | `admin123` |
| **Auditor Médico** | `auditor` | `auditor123` |

---

## ⚡ Recursos Especiais Disponíveis no Painel Admin

- **Monitor de Latência (Heartbeat em Tempo Real)**: Exibe no topo da tela (apenas para Administradores) a latência do servidor em milissegundos e o estado da conexão.
- **Sincronização Automática com XAMPP**: Pool de conexões inteligente com reconexão automática caso o XAMPP caia.
- **Interceptador de Erros SQL**: Captura erros de sintaxe e tabelas ausentes e mostra avisos amigáveis em português no Painel Admin.
- **Migração para ElasticSearch**: No **Painel Admin**, clique em **"Gerar Índices ElasticSearch"** para exportar todos os dados para a busca em tempo real do ElasticSearch.

---

## 🔄 Atualização Automática (Git Pull)
Para atualizar o código do projeto com as últimas correções, basta dar um duplo clique no arquivo `git-pull.bat` ou rodar no terminal:

```bash
npm run git-pull
```
