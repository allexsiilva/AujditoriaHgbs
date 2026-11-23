-- ========================================================
-- 🏥 HospAudit - Script Oficial de Inicialização de Banco de Dados MySQL
--
-- Este script cria a estrutura relacional ideal e insere TODOS os dados
-- padrões e ativos do sistema (Setores, Leitos, Perguntas de Checklist, 
-- Usuários Administradores, Perfis de Cargo e Módulos do Sistema).
--
-- Pronto para importação direta no seu phpMyAdmin (XAMPP).
-- ========================================================

CREATE DATABASE IF NOT EXISTS `hospaudit` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `hospaudit`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Estrutura da Tabela: hospaudit_store (Unificação de Cache Local)
CREATE TABLE IF NOT EXISTS `hospaudit_store` (
  `key_name` VARCHAR(100) NOT NULL PRIMARY KEY,
  `json_data` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Estrutura da Tabela: hospaudit_sectors (Setores Hospitalares)
CREATE TABLE IF NOT EXISTS `hospaudit_sectors` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Estrutura da Tabela: hospaudit_beds (Leitos Hospitalares)
CREATE TABLE IF NOT EXISTS `hospaudit_beds` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `number` VARCHAR(150) NOT NULL,
  `sectorId` VARCHAR(150) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_sector` (`sectorId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Estrutura da Tabela: hospaudit_questions (Perguntas de Checklist)
CREATE TABLE IF NOT EXISTS `hospaudit_questions` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `formType` VARCHAR(255) NULL,
  `section` VARCHAR(255) NULL,
  `label` TEXT NULL,
  `options` LONGTEXT NULL,
  `active` TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Estrutura da Tabela: hospaudit_users (Usuários do Sistema)
CREATE TABLE IF NOT EXISTS `hospaudit_users` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NULL,
  `role` VARCHAR(100) NULL,
  `permissions` LONGTEXT NULL,
  `cargo` VARCHAR(150) NULL,
  `createdAt` VARCHAR(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Estrutura da Tabela: hospaudit_cargos (Perfis e Cargos de Acesso)
CREATE TABLE IF NOT EXISTS `hospaudit_cargos` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `role` VARCHAR(100) NULL,
  `permissions` LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Estrutura da Tabela: hospaudit_modulos_sistema (Módulos do Sistema)
CREATE TABLE IF NOT EXISTS `hospaudit_modulos_sistema` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `status` INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Estrutura da Tabela: hospaudit_audits (Auditorias Registradas)
CREATE TABLE IF NOT EXISTS `hospaudit_audits` (
  `id` VARCHAR(150) NOT NULL PRIMARY KEY,
  `type` VARCHAR(100) NULL,
  `date` VARCHAR(100) NULL,
  `evaluator` VARCHAR(255) NULL,
  `sectorId` VARCHAR(150) NULL,
  `bedId` VARCHAR(150) NULL,
  `answers` LONGTEXT NULL,
  `status` VARCHAR(50) NULL,
  `createdAt` VARCHAR(100) NULL,
  KEY `idx_sector_audit` (`sectorId`),
  KEY `idx_bed_audit` (`bedId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ========================================================
-- 💾 INSERÇÃO DE DADOS PADRÕES DO SISTEMA (POPULAÇÃO INICIAL)
-- ========================================================

-- Limpando dados residuais para evitar duplicidade de chaves primárias
TRUNCATE TABLE `hospaudit_sectors`;
TRUNCATE TABLE `hospaudit_beds`;
TRUNCATE TABLE `hospaudit_questions`;
TRUNCATE TABLE `hospaudit_users`;
TRUNCATE TABLE `hospaudit_cargos`;
TRUNCATE TABLE `hospaudit_modulos_sistema`;
TRUNCATE TABLE `hospaudit_audits`;

-- ➡️ Inserindo Setores Padrões
INSERT INTO `hospaudit_sectors` (`id`, `name`, `description`) VALUES
('uti1', 'UTI 1', 'Unidade de Terapia Intensiva 1'),
('uti2', 'UTI 2', 'Unidade de Terapia Intensiva 2'),
('v97bpaudp', 'POSTO MATERNO INFANTIL ', 'Setor de obstetrícia e cuidados à mãe e ao bebê'),
('fyp0v6me8', 'POSTO 2', 'Enfermarias do Bloco 2'),
('2dllmdrly', 'POSTO 3', 'Apartamentos do Bloco 3'),
('ym3xjflk1', 'POSTO 4', 'Unidade de internação e clínica médica'),
('cp2glpdf5', 'OBSTETRICIA', 'Maternidade e partos'),
('l9a9n6wnj', 'RECEPÇÃO PRINCIPAL', 'Entrada e triagem geral'),
('ly2viyg71', 'CENTRO CIRURGICO', 'Salas de operações e recuperação anestésica');

-- ➡️ Inserindo Leitos Hospitalares Padrões
INSERT INTO `hospaudit_beds` (`id`, `number`, `sectorId`) VALUES
('uti1-l1', 'Leito 01', 'uti1'),
('uti1-l2', 'Leito 02', 'uti1'),
('uti1-l3', 'Leito 03', 'uti1'),
('uti1-l4', 'Leito 04', 'uti1'),
('uti1-l5', 'Leito 05', 'uti1'),
('uti1-l6', 'Leito 06', 'uti1'),
('uti1-l7', 'Leito 07', 'uti1'),
('uti1-l8', 'Leito 08', 'uti1'),
('uti1-l9', 'Leito 09', 'uti1'),
('uti1-l10', 'Leito 10', 'uti1'),
('uti2-l11', 'Leito 11', 'uti2'),
('uti2-l12', 'Leito 12', 'uti2'),
('uti2-l13', 'Leito 13', 'uti2'),
('uti2-l14', 'Leito 14', 'uti2'),
('uti2-l15', 'Leito 15', 'uti2'),
('uti2-l16', 'Leito 16', 'uti2'),
('uti2-l17', 'Leito 17', 'uti2'),
('uti2-l18', 'Leito 18', 'uti2'),
('uti2-l19', 'Leito 19', 'uti2'),
('uti2-l20', 'Leito 20', 'uti2'),
('8z14hcgqh', 'LEITO 21/01', 'ym3xjflk1'),
('o91wd3vtw', 'LEITO 21/02', 'ym3xjflk1'),
('r0dp0rjss', 'LEITO 21/03', 'ym3xjflk1'),
('db3ok48p4', 'LEITO 21/04', 'ym3xjflk1'),
('huw0wnpvp', 'LEITO 21/05', 'ym3xjflk1'),
('bnji7sxt1', 'LEITO 22/01', 'ym3xjflk1'),
('yh4s7ypj2', 'LEITO 22/02', 'ym3xjflk1'),
('ze045zpid', 'LEITO 22/03', 'ym3xjflk1'),
('r8unlmmbj', 'LEITO 22/04', 'ym3xjflk1'),
('wrvdgl31o', 'LEITO 22/05', 'ym3xjflk1'),
('tw13wm5ih', 'LEITO 23/01', 'ym3xjflk1'),
('1lp79lqgq', 'LEITO 23/02', 'ym3xjflk1'),
('a1v35o2gf', 'LEITO 23/03', 'ym3xjflk1'),
('ngf2fcm2n', 'LEITO 23/04', 'ym3xjflk1'),
('phamj99hb', 'LEITO 23/05', 'ym3xjflk1'),
('khdncqbqh', 'LEITO 23/06', 'ym3xjflk1'),
('hhwtono8i', 'LEITO 24/01', 'ym3xjflk1'),
('dirmu591c', 'LEITO 24/02', 'ym3xjflk1'),
('ei3z2xzbi', 'LEITO 24/03', 'ym3xjflk1'),
('zlx3kulso', 'LEITO 24/04', 'ym3xjflk1'),
('qbkgpsuaw', 'LEITO 24/05', 'ym3xjflk1'),
('huxefptxr', 'LEITO 24/06', 'ym3xjflk1'),
('k8ia4l2s8', 'LEITO 25/01', 'ym3xjflk1'),
('lpzocnwsp', 'LEITO 25/02', 'ym3xjflk1'),
('wj9kuel1k', 'LEITO 25/03', 'ym3xjflk1'),
('78e40476y', 'LEITO 25/04', 'ym3xjflk1'),
('rem3uv60x', 'LEITO 25/05', 'ym3xjflk1'),
('qbr1tbuih', 'LEITO 25/06', 'ym3xjflk1'),
('kk4w4401c', 'ENF 01/01', 'v97bpaudp'),
('y2mr4k8px', 'LEITO 01/02', 'v97bpaudp'),
('5rrtykdp4', 'LEITO 01/03', 'v97bpaudp'),
('8hgkaolsn', 'LEITO 02/01', 'cp2glpdf5'),
('wt72awt5y', 'LEITO 02/02', 'cp2glpdf5'),
('qxdqr6tbc', 'LEITO 02/03', 'cp2glpdf5'),
('aox8hzdzc', 'APTO 201', '2dllmdrly'),
('oabnwm7q5', 'APTO 202', '2dllmdrly'),
('y02c05tsw', 'APTO 203', '2dllmdrly'),
('z66lbcur7', 'LEITO 06/01', 'fyp0v6me8'),
('84lwbcjv4', 'LEITO 06/02', 'fyp0v6me8'),
('hw9n3e4qd', 'LEITO 06/03', 'fyp0v6me8');

-- ➡️ Inserindo Perguntas Oficiais de Auditoria (Checklists)
INSERT INTO `hospaudit_questions` (`id`, `formType`, `section`, `label`, `options`, `active`) VALUES
('cs_1', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Aspecto do local de inserção está adequado?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_2', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Óstio não visível (curativo íntegro)?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_3', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Presença de sinais flogísticos?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_4', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Todas as saídas não utilizadas estão devidamente protegidas?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_5', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Tipo do cateter utilizado:', '[\"C\",\"P\",\"CH\"]', 1),
('cs_6', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Tipo do curativo instalado:', '[\"E\",\"NE\"]', 1),
('cs_7', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Curativo conforme indicação do protocolo?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_8', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Curativo estéril totalmente aderido à pele?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_9', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Permite visualização do óstio?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_10', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Curativo limpo e seco?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_11', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Curativo dentro do prazo de validade?', '[\"S\",\"N\",\"NA\"]', 1),
('cs_12', 'IRAS', 'Prevenção de Infecção da Corrente Sanguínea', 'Conector sem qualquer resíduo de sangue?', '[\"S\",\"N\",\"NA\"]', 1),
('pav_1', 'IRAS', 'Prevenção de Pneumonia Associada a Ventilação Mecânica', 'Cavidade oral devidamente limpa?', '[\"S\",\"N\",\"NA\"]', 1),
('pav_2', 'IRAS', 'Prevenção de Pneumonia Associada a Ventilação Mecânica', 'Higiene oral de acordo com o protocolo institucional do hospital?', '[\"S\",\"N\",\"NA\"]', 1),
('pav_5', 'IRAS', 'Prevenção de Pneumonia Associada a Ventilação Mecânica', 'Mensurada pressão do cuff e encontra-se maior que 25cmH2O?', '[\"S\",\"N\",\"NA\"]', 1),
('pav_6', 'IRAS', 'Prevenção de Pneumonia Associada a Ventilação Mecânica', 'O nível de sedação está dentro da meta clínica estipulada?', '[\"S\",\"N\",\"NA\"]', 1),
('svd_1', 'IRAS', 'Prevenção de Infecção do Trato Urinário Associado a SVD', 'Há indicação médica imediata para retirada do dispositivo (SVD)?', '[\"S\",\"N\",\"NA\"]', 1),
('svd_2', 'IRAS', 'Prevenção de Infecção do Trato Urinário Associado a SVD', 'Fixação da sonda adequada no membro inferior?', '[\"S\",\"N\",\"NA\"]', 1),
('svd_3', 'IRAS', 'Prevenção de Infecção do Trato Urinário Associado a SVD', 'Fluxo de urina contínuo, sem dobras ou presença de grumos?', '[\"S\",\"N\",\"NA\"]', 1),
('svd_4', 'IRAS', 'Prevenção de Infecção do Trato Urinário Associado a SVD', 'Capacidade de bolsa coletora até 2/3?', '[\"S\",\"N\",\"NA\"]', 1),
('id_1', 'SAFETY', 'Identificação do Paciente', 'O paciente possui placa de identificação no leito?', '[\"Sim\",\"Não\"]', 1),
('id_2', 'SAFETY', 'Identificação do Paciente', 'O paciente possui pulseira de identificação ativa?', '[\"Sim\",\"Não\"]', 1),
('id_4', 'SAFETY', 'Identificação do Paciente', 'Os dados impressos na pulseira conferem com o prontuário?', '[\"Sim\",\"Não\"]', 1),
('id_5', 'SAFETY', 'Identificação do Paciente', 'A equipe de enfermagem verifica a pulseira antes de administrar medicações?', '[\"Sim\",\"Não\"]', 1),
('cm_2', 'SAFETY', 'Comunicação Efetiva', 'Há solicitação médica documentada para vaga de UTI?', '[\"Sim\",\"Não\"]', 1),
('cm_3', 'SAFETY', 'Comunicação Efetiva', 'Sumário de alta hospitalar assinado e preenchido?', '[\"Sim\",\"Não\"]', 1),
('cm_4', 'SAFETY', 'Comunicação Efetiva', 'Parecer de especialista solicitado no sistema?', '[\"Sim\",\"Não\"]', 1),
('cm_5', 'SAFETY', 'Comunicação Efetiva', 'O parecer de avaliação solicitado foi devidamente respondido?', '[\"Sim\",\"Não\"]', 1),
('md_1', 'SAFETY', 'Medicação', 'A dupla checagem por dois profissionais é realizada na administração?', '[\"Sim\",\"Não\"]', 1),
('md_2', 'SAFETY', 'Medicação', 'Aprazamento e checagem da prescrição estão corretos?', '[\"Sim\",\"Não\"]', 1),
('md_3', 'SAFETY', 'Medicação', 'Informação sobre alergia medicamentosa visível?', '[\"Sim\",\"Não\"]', 1),
('cg_1', 'SAFETY', 'Cirurgia Segura', 'A marcação do sítio cirúrgico é feita antes do envio à sala?', '[\"Sim\",\"Não\"]', 1),
('cg_3', 'SAFETY', 'Cirurgia Segura', 'O termo de consentimento cirúrgico está assinado e anexado?', '[\"Sim\",\"Não\"]', 1),
('ri_2', 'SAFETY', 'Redução das Infecções', 'Há pias abastecidas e dispensadores de álcool em gel em pleno funcionamento?', '[\"Sim\",\"Não\"]', 1),
('ql_1', 'SAFETY', 'Quedas e Lesão por Pressão', 'Avaliação de risco de queda ou lesão por pressão é feita diariamente?', '[\"Sim\",\"Não\"]', 1),
('ql_2', 'SAFETY', 'Quedas e Lesão por Pressão', 'Grades de proteção do leito estão elevadas e rodas do leito travadas?', '[\"Sim\",\"Não\"]', 1),
('ql_3', 'SAFETY', 'Quedas e Lesão por Pressão', 'O plano inclui mudança sistemática de decúbito e hidratação?', '[\"Sim\",\"Não\"]', 1);

-- ➡️ Inserindo Usuários Padrões
INSERT INTO `hospaudit_users` (`id`, `name`, `email`, `password`, `role`, `permissions`, `cargo`, `createdAt`) VALUES
('1', 'Administrador', 'admin', 'admin', 'MASTER', '[\"ALL\"]', 'Administrador Master', '2026-07-21 11:00:00'),
('user-luiz-romining', 'Luiz Romining', 'luiz.romining', 'luiz', 'USER', '[\"DASHBOARD\",\"NEW_AUDIT\",\"COMPLETED_AUDITS\",\"REPORTS\",\"COMPARATIVE\"]', 'Auditor Clínico', '2026-07-21 11:30:00');

-- ➡️ Inserindo Perfis de Cargo
INSERT INTO `hospaudit_cargos` (`id`, `name`, `role`, `permissions`) VALUES
('master', 'Administrador Master', 'MASTER', '[\"ALL\"]'),
('admin', 'Administrador', 'ADMIN', '[\"DASHBOARD\",\"COMPARATIVE\",\"AGENDA\",\"SECTORS\",\"BEDS\",\"QUESTIONS\",\"NEW_AUDIT\",\"COMPLETED_AUDITS\",\"REPORTS\",\"FORMULARIO\",\"USERS_PERMISSIONS\",\"HOSPITAL_ATENDIMENTO\",\"HOSPITAL_CLINICO\",\"HOSPITAL_ESTOQUE\",\"HOSPITAL_FINANCEIRO\"]'),
('auditor_clinico', 'Auditor Clínico', 'USER', '[\"DASHBOARD\",\"NEW_AUDIT\",\"COMPLETED_AUDITS\",\"FORMULARIO\",\"HOSPITAL_CLINICO\"]'),
('enfermeiro_chefe', 'Enfermeiro Chefe', 'ADMIN', '[\"DASHBOARD\",\"COMPARATIVE\",\"AGENDA\",\"SECTORS\",\"BEDS\",\"QUESTIONS\",\"NEW_AUDIT\",\"COMPLETED_AUDITS\",\"REPORTS\",\"HOSPITAL_ATENDIMENTO\",\"HOSPITAL_CLINICO\",\"HOSPITAL_ESTOQUE\"]'),
('atendente_recepcao', 'Atendente de Recepção', 'USER', '[\"DASHBOARD\",\"AGENDA\",\"HOSPITAL_ATENDIMENTO\"]'),
('farmaceutico', 'Farmacêutico Hospitalar', 'USER', '[\"DASHBOARD\",\"HOSPITAL_ESTOQUE\"]'),
('faturista', 'Faturista Hospitalar', 'USER', '[\"DASHBOARD\",\"HOSPITAL_FINANCEIRO\"]'),
('tecnico_enfermagem', 'Técnico de Enfermagem', 'USER', '[\"DASHBOARD\",\"NEW_AUDIT\"]');

-- ➡️ Inserindo Módulos Ativos do Sistema
INSERT INTO `hospaudit_modulos_sistema` (`id`, `name`, `status`) VALUES
('DASHBOARD', 'Painel de Indicadores & Estatísticas', 1),
('INDICADORES', 'Módulo Indicadores (TV/Tablets)', 1),
('COMPARATIVE', 'Painel Comparativo de Setores', 1),
('AGENDA', 'Agenda & Cronograma', 1),
('SECTORS', 'Cadastro de Setores', 1),
('BEDS', 'Cadastro de Leitos', 1),
('QUESTIONS', 'Cadastro de Perguntas & Checklists', 1),
('NEW_AUDIT', 'Nova Auditoria', 1),
('COMPLETED_AUDITS', 'Auditorias Realizadas', 1),
('FORMULARIO', 'Módulo de Formulários Clínicos', 1),
('VOTING', 'Votação Online & Modelos', 1),
('REPORTS', 'Gerar Relatórios & Exportações', 1),
('USERS_PERMISSIONS', 'Gestão de Usuários & Permissões', 1);

-- ➡️ Inserindo Auditorias Iniciais (Para funcionamento imediato dos Gráficos e BI no Dashboard)
INSERT INTO `hospaudit_audits` (`id`, `type`, `date`, `evaluator`, `sectorId`, `bedId`, `answers`, `status`, `createdAt`) VALUES
('wj6frt5at', 'IRAS', '2026-06-22 20:00:00', 'Luiz Romining', 'uti1', 'uti1-l1', '{\"cs_1\":\"S\",\"cs_10\":\"N\",\"cs_11\":\"S\",\"cs_12\":\"N\",\"cs_2\":\"S\",\"cs_3\":\"S\",\"cs_4\":\"S\",\"cs_5\":\"C\",\"cs_6\":\"E\",\"cs_7\":\"S\",\"cs_8\":\"N\",\"cs_9\":\"S\",\"svd_1\":\"NA\",\"svd_2\":\"NA\",\"svd_3\":\"NA\",\"svd_4\":\"NA\",\"svd_5\":\"NA\",\"svd_6\":\"NA\",\"pav_1\":\"S\",\"pav_2\":\"S\",\"pav_3\":\"NA\",\"pav_4\":\"S\",\"pav_5\":\"NA\",\"pav_6\":\"S\"}', 'ATIVO', '2026-06-23 13:01:21'),
('ko9ha00lx', 'IRAS', '2026-06-22 20:00:00', 'Luiz Romining', 'uti1', 'uti1-l2', '{\"cs_1\":\"S\",\"cs_10\":\"S\",\"cs_11\":\"S\",\"cs_12\":\"S\",\"cs_2\":\"S\",\"cs_3\":\"S\",\"cs_4\":\"S\",\"cs_5\":\"C\",\"cs_6\":\"E\",\"cs_7\":\"S\",\"cs_8\":\"S\",\"cs_9\":\"S\",\"svd_1\":\"NA\",\"svd_2\":\"NA\",\"svd_3\":\"NA\",\"svd_4\":\"NA\",\"svd_5\":\"NA\",\"svd_6\":\"NA\",\"pav_1\":\"S\",\"pav_2\":\"S\",\"pav_3\":\"NA\",\"pav_4\":\"S\",\"pav_5\":\"NA\",\"pav_6\":\"NA\"}', 'ATIVO', '2026-06-23 13:02:43'),
('w8a2vckko', 'IRAS', '2026-06-22 20:00:00', 'Luiz Romining', 'uti1', 'uti1-l3', '{\"cs_1\":\"N\",\"cs_10\":\"S\",\"cs_11\":\"S\",\"cs_12\":\"S\",\"cs_2\":\"S\",\"cs_3\":\"N\",\"cs_4\":\"S\",\"cs_5\":\"C\",\"cs_6\":\"E\",\"cs_7\":\"S\",\"cs_8\":\"S\",\"cs_9\":\"S\",\"svd_1\":\"NA\",\"svd_2\":\"NA\",\"svd_3\":\"NA\",\"svd_4\":\"NA\",\"svd_5\":\"NA\",\"svd_6\":\"NA\",\"pav_1\":\"S\",\"pav_2\":\"S\",\"pav_3\":\"NA\",\"pav_4\":\"S\",\"pav_5\":\"NA\",\"pav_6\":\"NA\"}', 'ATIVO', '2026-06-23 13:03:43'),
('k0u7r2luv', 'SAFETY', '2026-06-22 20:00:00', 'Luiz Romining', 'ym3xjflk1', 'r0dp0rjss', '{\"cg_1\":\"Não\",\"cg_2\":\"Sim\",\"cg_3\":\"Sim\",\"cm_1\":\"Sim\",\"cm_2\":\"Não\",\"cm_3\":\"Não\",\"cm_4\":\"Sim\",\"cm_5\":\"Sim\",\"id_1\":\"Sim\",\"id_2\":\"Não\",\"id_3\":\"Não\",\"id_4\":\"Não\",\"id_5\":\"Sim\",\"md_1\":\"Sim\",\"md_2\":\"Sim\",\"md_3\":\"Sim\",\"ql_1\":\"Sim\",\"ql_2\":\"Sim\",\"ql_3\":\"Sim\",\"ri_1\":\"Sim\",\"ri_2\":\"Sim\",\"ri_3\":\"Não\"}', 'ATIVO', '2026-06-23 14:13:15');

SET FOREIGN_KEY_CHECKS = 1;
