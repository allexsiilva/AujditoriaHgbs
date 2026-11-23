export interface SystemModule {
  id: string;
  name: string;
  description: string;
  category: 'Estatísticas' | 'Cadastros' | 'Auditoria' | 'Relatórios' | 'Hospitalar' | 'Personalizados' | 'Gestão';
  icon: string;
  items?: string[];
}

export const AVAILABLE_MODULES: SystemModule[] = [
  { id: 'DASHBOARD', name: 'Dashboard Principal', description: 'Visão geral das auditorias, leitos sem avaliação e taxas de conformidade.', category: 'Estatísticas', icon: 'LayoutDashboard', items: ['Visão Geral', 'Leitos Pendentes', 'Métricas de Controle'] },
  { id: 'INDICADORES', name: 'Painel de Indicadores & Estatísticas', description: 'Monitor de indicadores operacionais e de adesão clínica por setor.', category: 'Estatísticas', icon: 'BarChart2', items: ['Auditorias por Setor', 'Status de Auditorias (Concluídas vs. Pendentes)'] },
  { id: 'COMPARATIVE', name: 'Análise Comparativa', description: 'Gráficos comparativos de conformidade histórica entre setores e metas de segurança.', category: 'Estatísticas', icon: 'TrendingUp', items: ['Gráfico de Evolução', 'Comparativo Setorial'] },
  { id: 'SECTORS', name: 'Cadastro de Setores', description: 'Mapeamento e cadastro das alas clínicas e cirúrgicas (ex: UTI, Pediatria, Centro Cirúrgico).', category: 'Cadastros', icon: 'LayoutGrid', items: ['Configuração de Alas', 'Responsáveis Clínicos'] },
  { id: 'BEDS', name: 'Cadastro de Leitos', description: 'Controle de numeração de leitos físicos disponíveis e sua vinculação aos setores hospitalares correspondentes.', category: 'Cadastros', icon: 'Bed', items: ['Vinculação de Leitos', 'Status de Ocupação'] },
  { id: 'QUESTIONS', name: 'Cadastro de Perguntas & Checklists', description: 'Configuração personalizada das perguntas e critérios avaliativos dos formulários de auditoria.', category: 'Cadastros', icon: 'HelpCircle', items: ['Critérios de Avaliação', 'Configuração de Checklists'] },
  { id: 'NEW_AUDIT', name: 'Nova Auditoria', description: 'Execução interativa do checklist clínico à beira do leito do paciente (dispositivo móvel ou desktop).', category: 'Auditoria', icon: 'PlusCircle', items: ['Checklist IRAS', 'Checklist SAFETY'] },
  { id: 'REPORTS', name: 'Gerar Relatórios & Exportações', description: 'Geração de relatórios consolidados em formato PDF e planilhas estruturadas para auditoria externa.', category: 'Relatórios', icon: 'FileSpreadsheet', items: ['Exportação de PDF', 'Exportação de Excel'] },
  { id: 'COMPLETED_AUDITS', name: 'Auditorias Realizadas', description: 'Acesso ao histórico de todas as auditorias finalizadas, permitindo consulta detalhada, edição e exclusão.', category: 'Auditoria', icon: 'ClipboardCheck', items: ['Histórico Completo', 'Consulta Detalhada', 'Edição de Registros'] }
];
