import React, { useState, useContext, useMemo, useRef } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Trash2, 
  Pencil, 
  Briefcase, 
  Building, 
  CheckCircle, 
  XCircle, 
  Plus, 
  X, 
  Filter, 
  Clock, 
  CreditCard, 
  Mail, 
  Phone, 
  Check,
  Building2,
  AlertCircle,
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { useAuditData } from '../context/AuditContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { Employee } from '../types';
import * as XLSX from 'xlsx';

export function ModuleFuncionarios() {
  const { employees, addEmployee, addEmployeesBatch, updateEmployee, deleteEmployee, sectors } = useAuditData();
  const { cargos, user: currentUser } = useContext(AuthContext);
  const { showToast } = useContext(ToastContext);

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCargo, setSelectedCargo] = useState('ALL');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cargoId, setCargoId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [status, setStatus] = useState<'ATIVO' | 'INATIVO'>('ATIVO');
  const [admissionDate, setAdmissionDate] = useState('');
  const [professionalRegistry, setProfessionalRegistry] = useState('');

  // Delete Confirmation state
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Excel Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [importedRows, setImportedRows] = useState<Array<{
    employee: Omit<Employee, 'id'>;
    rowNum: number;
    status: 'success' | 'warning' | 'error';
    messages: string[];
    sectorNameMatched?: string;
    cargoNameMatched?: string;
  }>>([]);

  // Permissions check
  const isWritable = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN' || currentUser.role === 'MASTER') return true;
    
    // Check custom permissions for this module
    if (currentUser.permissions.includes('CADASTRO_FUNCIONARIOS') || currentUser.permissions.includes('ALL')) {
      return true;
    }
    return false;
  }, [currentUser]);

  // Statistics
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.status === 'ATIVO').length;
    const inactive = total - active;
    
    // Group by cargo
    const cargoCounts: Record<string, number> = {};
    employees.forEach(e => {
      cargoCounts[e.cargoId] = (cargoCounts[e.cargoId] || 0) + 1;
    });

    return { total, active, inactive, cargoCounts };
  }, [employees]);

  // Handle opening modal for creation
  const handleOpenAdd = () => {
    if (!isWritable) {
      showToast('error', 'Acesso Negado', 'Você não tem permissão para cadastrar funcionários.');
      return;
    }
    setEditingEmployee(null);
    setName('');
    setCpf('');
    setPhone('');
    setEmail('');
    setCargoId('');
    setSectorId('');
    setStatus('ATIVO');
    setAdmissionDate(new Date().toISOString().split('T')[0]);
    setProfessionalRegistry('');
    setIsModalOpen(true);
  };

  // Handle opening modal for edit
  const handleOpenEdit = (emp: Employee) => {
    if (!isWritable) {
      showToast('error', 'Acesso Negado', 'Você não tem permissão para editar cadastros de funcionários.');
      return;
    }
    setEditingEmployee(emp);
    setName(emp.name);
    setCpf(emp.cpf);
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setCargoId(emp.cargoId);
    setSectorId(emp.sectorId || '');
    setStatus(emp.status);
    setAdmissionDate(emp.admissionDate || '');
    setProfessionalRegistry(emp.professionalRegistry || '');
    setIsModalOpen(true);
  };

  // Mask CPF input (000.000.000-00)
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // Apply masking
    if (value.length > 9) {
      value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
    } else if (value.length > 6) {
      value = value.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    } else if (value.length > 3) {
      value = value.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
    }
    setCpf(value);
  };

  // Mask Phone input ((00) 00000-0000)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 10) {
      value = value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (value.length > 6) {
      value = value.replace(/^(\d{2})(\d{4})(\d{1,4})$/, '($1) $2-$3');
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{1,4})$/, '($1) $2');
    } else if (value.length > 0) {
      value = `(${value}`;
    }
    setPhone(value);
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'Campo Obrigatório', 'Por favor, preencha o nome.');
      return;
    }
    if (!cpf.trim() || cpf.length < 14) {
      showToast('error', 'CPF Inválido', 'Por favor, informe um CPF completo.');
      return;
    }
    if (!cargoId) {
      showToast('error', 'Campo Obrigatório', 'Por favor, selecione o cargo.');
      return;
    }

    const payload = {
      name,
      cpf,
      phone: phone || undefined,
      email: email || undefined,
      cargoId,
      sectorId: sectorId || undefined,
      status,
      admissionDate: admissionDate || undefined,
      professionalRegistry: professionalRegistry || undefined
    };

    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
      } else {
        await addEmployee(payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast('error', 'Falha no Servidor', err.message || 'Erro ao processar requisição.');
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!employeeToDelete) return;
    try {
      await deleteEmployee(employeeToDelete.id);
      setEmployeeToDelete(null);
    } catch (err: any) {
      showToast('error', 'Falha na Exclusão', err.message || 'Erro ao remover funcionário.');
    }
  };

  // Excel template generator and downloader
  const downloadTemplate = () => {
    const headers = [
      ['Nome', 'CPF', 'Telefone', 'Email', 'Cargo', 'Setor', 'RegistroProfissional', 'DataAdmissao', 'Status']
    ];
    
    const sectorSample1 = sectors[0]?.name || 'Pronto Socorro';
    const sectorSample2 = sectors[1]?.name || 'UTI Adulto';
    
    const cargoSample1 = cargos[0]?.name || 'Médico';
    const cargoSample2 = cargos[1]?.name || 'Enfermeiro';

    const data = [
      ...headers,
      ['Dr. Eduardo G. Menezes', '12345678900', '(11) 98765-4321', 'eduardo.menezes@hospital.com', cargoSample1, sectorSample1, 'CRM 48190', '2026-01-15', 'ATIVO'],
      ['Enfª Mariana Alencar', '98765432111', '(11) 91234-5678', 'mariana.alencar@hospital.com', cargoSample2, sectorSample2, 'COREN 55321', '2026-03-10', 'ATIVO']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set columns width
    const wscols = [
      { wch: 25 }, // Nome
      { wch: 15 }, // CPF
      { wch: 15 }, // Telefone
      { wch: 25 }, // Email
      { wch: 15 }, // Cargo
      { wch: 15 }, // Setor
      { wch: 18 }, // RegistroProfissional
      { wch: 15 }, // DataAdmissao
      { wch: 10 }  // Status
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Prestadores');
    XLSX.writeFile(wb, 'Modelo_Importacao_Funcionarios.xlsx');
    showToast('success', 'Modelo Baixado', 'Planilha modelo gerada e baixada com sucesso.');
  };

  // Excel file reader and parser
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        if (data.length === 0) {
          showToast('error', 'Planilha Vazia', 'A planilha selecionada não possui dados.');
          return;
        }

        // Headers search
        const firstRow = data[0] as any[];
        if (!firstRow || firstRow.length === 0) {
          showToast('error', 'Sem Cabeçalho', 'Não foi possível encontrar a linha de cabeçalho.');
          return;
        }

        const headers = firstRow.map(h => String(h || '').trim().toLowerCase());
        
        const colIndices = {
          nome: headers.findIndex(h => ['nome', 'name', 'funcionário', 'funcionario', 'colaborador', 'prestador', 'nome completo', 'completo'].includes(h)),
          cpf: headers.findIndex(h => ['cpf', 'documento', 'identidade'].includes(h)),
          telefone: headers.findIndex(h => ['telefone', 'tel', 'celular', 'phone', 'contato'].includes(h)),
          email: headers.findIndex(h => ['email', 'e-mail', 'correio'].includes(h)),
          cargo: headers.findIndex(h => ['cargo', 'função', 'funcao', 'role', 'cargoid', 'cargo_id'].includes(h)),
          setor: headers.findIndex(h => ['setor', 'unidade', 'ala', 'sector', 'sectorid', 'sector_id'].includes(h)),
          registro: headers.findIndex(h => ['registro', 'conselho', 'crm', 'coren', 'registroprofissional', 'registro_profissional', 'registro profissional'].includes(h)),
          admissao: headers.findIndex(h => ['admissão', 'admissao', 'data de admissão', 'data admissao', 'admissiondate', 'admission_date', 'data de admissao'].includes(h)),
          status: headers.findIndex(h => ['status', 'situação', 'situacao', 'ativo', 'estado'].includes(h))
        };

        if (colIndices.nome === -1 || colIndices.cpf === -1 || colIndices.cargo === -1) {
          showToast('error', 'Colunas Incompatíveis', 'A planilha deve conter pelo menos as colunas "Nome", "CPF" e "Cargo". Baixe o modelo para conferir.');
          return;
        }

        const rows = data.slice(1);
        const parsed: Array<{
          employee: Omit<Employee, 'id'>;
          rowNum: number;
          status: 'success' | 'warning' | 'error';
          messages: string[];
          sectorNameMatched?: string;
          cargoNameMatched?: string;
        }> = [];

        rows.forEach((row: any, index) => {
          if (!row || row.length === 0 || row.every((cell: any) => cell === null || cell === undefined || cell === '')) {
            return;
          }

          const rowNum = index + 2;
          const messages: string[] = [];
          let rowStatus: 'success' | 'warning' | 'error' = 'success';

          const rawNome = String(row[colIndices.nome] || '').trim();
          const rawCpf = String(row[colIndices.cpf] || '').trim().replace(/\D/g, '');
          const rawTelefone = colIndices.telefone !== -1 && row[colIndices.telefone] ? String(row[colIndices.telefone]).trim() : '';
          const rawEmail = colIndices.email !== -1 && row[colIndices.email] ? String(row[colIndices.email]).trim() : '';
          const rawCargo = colIndices.cargo !== -1 && row[colIndices.cargo] ? String(row[colIndices.cargo]).trim() : '';
          const rawSetor = colIndices.setor !== -1 && row[colIndices.setor] ? String(row[colIndices.setor]).trim() : '';
          const rawRegistro = colIndices.registro !== -1 && row[colIndices.registro] ? String(row[colIndices.registro]).trim() : '';
          const rawAdmissao = colIndices.admissao !== -1 && row[colIndices.admissao] ? String(row[colIndices.admissao]).trim() : '';
          const rawStatusVal = colIndices.status !== -1 && row[colIndices.status] ? String(row[colIndices.status]).trim().toUpperCase() : 'ATIVO';

          if (!rawNome) {
            rowStatus = 'error';
            messages.push('Nome do funcionário está em branco.');
          }

          let formattedCpf = rawCpf;
          if (!rawCpf) {
            rowStatus = 'error';
            messages.push('CPF está em branco.');
          } else if (rawCpf.length !== 11) {
            rowStatus = 'warning';
            messages.push('CPF não possui exatamente 11 dígitos. Será salvo como está.');
            formattedCpf = rawCpf;
          } else {
            formattedCpf = rawCpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
          }

          let finalCargoId = '';
          let cargoLabel = '';
          if (!rawCargo) {
            rowStatus = 'error';
            messages.push('Cargo está em branco.');
          } else {
            const matchedCargo = cargos.find(c => 
              c.id.toLowerCase() === rawCargo.toLowerCase() || 
              c.name.toLowerCase() === rawCargo.toLowerCase()
            );
            if (matchedCargo) {
              finalCargoId = matchedCargo.id;
              cargoLabel = matchedCargo.name;
            } else {
              finalCargoId = rawCargo;
              cargoLabel = rawCargo;
              rowStatus = 'warning';
              messages.push(`Cargo "${rawCargo}" não pré-cadastrado. Será salvo como novo.`);
            }
          }

          let finalSectorId = '';
          let sectorLabel = '';
          if (rawSetor) {
            const matchedSector = sectors.find(s => 
              s.id.toLowerCase() === rawSetor.toLowerCase() || 
              s.name.toLowerCase() === rawSetor.toLowerCase()
            );
            if (matchedSector) {
              finalSectorId = matchedSector.id;
              sectorLabel = matchedSector.name;
            } else {
              rowStatus = 'warning';
              messages.push(`Setor "${rawSetor}" não localizado no sistema.`);
              finalSectorId = rawSetor;
              sectorLabel = rawSetor;
            }
          }

          let finalAdmissao = rawAdmissao;
          if (rawAdmissao) {
            if (!isNaN(Number(rawAdmissao))) {
              const excelDate = new Date((Number(rawAdmissao) - (25567 + 2)) * 86400 * 1000);
              finalAdmissao = excelDate.toISOString().split('T')[0];
            } else {
              const brDateMatch = rawAdmissao.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (brDateMatch) {
                finalAdmissao = `${brDateMatch[3]}-${brDateMatch[2]}-${brDateMatch[1]}`;
              }
            }
          } else {
            finalAdmissao = new Date().toISOString().split('T')[0];
          }

          const finalStatus: 'ATIVO' | 'INATIVO' = (rawStatusVal === 'INATIVO' || rawStatusVal === 'INACTIVE' || rawStatusVal === '0') ? 'INATIVO' : 'ATIVO';

          const emp: Omit<Employee, 'id'> = {
            name: rawNome,
            cpf: formattedCpf,
            phone: rawTelefone || undefined,
            email: rawEmail || undefined,
            cargoId: finalCargoId,
            sectorId: finalSectorId || undefined,
            status: finalStatus,
            admissionDate: finalAdmissao,
            professionalRegistry: rawRegistro || undefined
          };

          parsed.push({
            employee: emp,
            rowNum,
            status: rowStatus,
            messages,
            sectorNameMatched: sectorLabel,
            cargoNameMatched: cargoLabel
          });
        });

        setImportedRows(parsed);
        showToast('success', 'Planilha Processada', `${parsed.length} linhas preparadas para revisão.`);
      } catch (err: any) {
        showToast('error', 'Falha na Leitura', 'Erro ao ler arquivo do Excel: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Submit parsed batch to context
  const handleConfirmImport = async () => {
    const validRows = importedRows.filter(r => r.status !== 'error');
    if (validRows.length === 0) {
      showToast('error', 'Nenhum Registro Válido', 'Nenhum registro apto para importação.');
      return;
    }

    setIsSavingImport(true);
    try {
      const listToImport = validRows.map(r => r.employee);
      await addEmployeesBatch(listToImport);
      setIsImportModalOpen(false);
      setImportedRows([]);
    } catch (err: any) {
      showToast('error', 'Falha na Importação', 'Não foi possível salvar os funcionários: ' + err.message);
    } finally {
      setIsSavingImport(false);
    }
  };

  // Filter & Search Logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // 1. Search Query (Matches name, CPF, or email)
      const matchesSearch = 
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cpf.includes(searchTerm) ||
        (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Filter Cargo
      const matchesCargo = selectedCargo === 'ALL' || emp.cargoId === selectedCargo;

      // 3. Filter Sector
      const matchesSector = selectedSector === 'ALL' || emp.sectorId === selectedSector;

      // 4. Filter Status
      const matchesStatus = selectedStatus === 'ALL' || emp.status === selectedStatus;

      return matchesSearch && matchesCargo && matchesSector && matchesStatus;
    });
  }, [employees, searchTerm, selectedCargo, selectedSector, selectedStatus]);

  // Find Sector Name helper
  const getSectorName = (id?: string) => {
    if (!id) return '-';
    return sectors.find(s => s.id === id)?.name || '-';
  };

  // Find Cargo Name helper
  const getCargoName = (id: string) => {
    return cargos.find(c => c.id === id)?.name || id;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-600" />
            Gestão & Cadastro de Funcionários
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registro em tempo real de funcionários, alocações, conselhos profissionais e status ativo.
          </p>
        </div>
        
        {isWritable && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg border border-slate-200 shadow-3xs transition-all hover:shadow-xs text-sm cursor-pointer"
            >
              <Upload className="w-4 h-4 text-emerald-600" />
              Importar Planilha
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-all hover:shadow text-sm cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar Funcionário
            </button>
          </div>
        )}
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Total Registrados</span>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</h3>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Colaboradores Ativos</span>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{stats.active}</h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Inativos / Afastados</span>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{stats.inactive}</h3>
          </div>
          <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Sincronização Direta</span>
            <h3 className="text-sm font-semibold text-slate-500 mt-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
              Servidor MySQL Online
            </h3>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-xs font-mono">
            REALTIME
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/85 shadow-sm mb-6 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou e-mail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-sm placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:w-2/3">
            {/* Cargo filter */}
            <div className="relative">
              <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedCargo}
                onChange={e => setSelectedCargo(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-sm appearance-none bg-white text-slate-700"
              >
                <option value="ALL">Todos os Cargos</option>
                {cargos.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Sector filter */}
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedSector}
                onChange={e => setSelectedSector(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-sm appearance-none bg-white text-slate-700"
              >
                <option value="ALL">Todos os Setores</option>
                {sectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div className="relative">
              <Check className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-sm appearance-none bg-white text-slate-700"
              >
                <option value="ALL">Todos os Status</option>
                <option value="ATIVO">Ativos</option>
                <option value="INATIVO">Inativos</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200/85 shadow-sm overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-700">Nenhum funcionário encontrado</p>
            <p className="text-sm text-slate-400 mt-1">
              Tente redefinir os filtros ou registrar um novo colaborador.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-6">Funcionário</th>
                  <th className="py-4 px-6">CPF</th>
                  <th className="py-4 px-6">Cargo / Setor</th>
                  <th className="py-4 px-6">Conselho Profissional</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Admissão</th>
                  {isWritable && <th className="py-4 px-6 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-sm border border-indigo-100">
                          {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            {emp.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {emp.email}</span>}
                            {emp.email && emp.phone && <span className="text-slate-300">•</span>}
                            {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {emp.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-600">{emp.cpf}</td>
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-slate-800">{getCargoName(emp.cargoId)}</div>
                        <div className="text-xs text-slate-500">{getSectorName(emp.sectorId)}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {emp.professionalRegistry ? (
                        <span className="font-medium text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {emp.professionalRegistry}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Não possui</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {emp.status === 'ATIVO' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          <CheckCircle className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          <XCircle className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-mono text-xs">
                      {emp.admissionDate ? new Date(emp.admissionDate).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    {isWritable && (
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-indigo-600 transition"
                            title="Editar Cadastro"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEmployeeToDelete(emp)}
                            className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
            <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Dra. Ana Julia Souza"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-300"
                  />
                </div>

                {/* CPF */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    CPF <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-300 font-mono"
                  />
                </div>

                {/* Registro profissional */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Conselho (CRM/COREN etc)
                  </label>
                  <input
                    type="text"
                    value={professionalRegistry}
                    onChange={e => setProfessionalRegistry(e.target.value)}
                    placeholder="Ex: COREN 12345/SP"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-300"
                  />
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Telefone de Contato
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(11) 99999-9999"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-300 font-mono"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    E-mail Institucional
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@hospital.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-300"
                  />
                </div>

                {/* Cargo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Cargo / Função <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={cargoId}
                    onChange={e => setCargoId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="">Selecione um Cargo</option>
                    {cargos.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Setor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Setor Alocado
                  </label>
                  <select
                    value={sectorId}
                    onChange={e => setSectorId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="">Nenhum Setor Específico</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Data Admissão */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    value={admissionDate}
                    onChange={e => setAdmissionDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Status Cadastral
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        checked={status === 'ATIVO'}
                        onChange={() => setStatus('ATIVO')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      Ativo
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        checked={status === 'INATIVO'}
                        onChange={() => setStatus('INATIVO')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      Inativo
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm hover:shadow transition"
                >
                  {editingEmployee ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <AlertCircle className="w-6 h-6" />
                <h3 className="font-bold text-slate-900 text-lg">Confirmar Remoção</h3>
              </div>
              <p className="text-sm text-slate-500">
                Tem certeza que deseja remover o funcionário <strong>{employeeToDelete.name}</strong>? Esta ação é irreversível e removerá as credenciais vinculadas no servidor em tempo real.
              </p>
              
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setEmployeeToDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                >
                  Voltar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Importar Prestadores via Excel</h3>
                  <p className="text-xs text-slate-500">Envie uma planilha com os dados dos profissionais para cadastrar ou atualizar em lote</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportedRows([]);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Instructions and Download Template */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-slate-800 text-sm">Como preparar seu arquivo:</h4>
                  <ul className="text-xs text-slate-500 space-y-1 list-disc pl-4">
                    <li>Sua planilha deve conter as colunas: <strong>Nome, CPF, Cargo</strong> (mínimo obrigatório).</li>
                    <li>Também suporta: <strong>Telefone, Email, Setor, RegistroProfissional, DataAdmissao, Status</strong>.</li>
                    <li>Os nomes dos setores e cargos serão vinculados automaticamente se existirem no sistema.</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="shrink-0 inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-3.5 py-2 rounded-lg text-xs shadow-3xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  Baixar Planilha Modelo
                </button>
              </div>

              {/* Drag-and-drop / Upload Zone */}
              {importedRows.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-emerald-500/75 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/25 hover:bg-emerald-50/5 transition-all group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <Upload className="w-10 h-10 text-slate-400 group-hover:text-emerald-600 mx-auto mb-3 transition-colors" />
                  <p className="text-sm font-semibold text-slate-700">Selecione ou arraste seu arquivo Excel/CSV</p>
                  <p className="text-xs text-slate-400 mt-1">Formatos suportados: .xlsx, .xls, .csv de até 10MB</p>
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* Results Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                      Prévia dos Dados ({importedRows.length} registros identificados)
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportedRows([])}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer animate-pulse"
                    >
                      Limpar e Enviar Outro Arquivo
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto bg-white shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-4 text-center w-12 border-r border-slate-100">Ref</th>
                          <th className="py-2.5 px-4">Nome</th>
                          <th className="py-2.5 px-4">CPF</th>
                          <th className="py-2.5 px-4">Cargo</th>
                          <th className="py-2.5 px-4">Setor</th>
                          <th className="py-2.5 px-4">Registro</th>
                          <th className="py-2.5 px-4">Admissão</th>
                          <th className="py-2.5 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                        {importedRows.map((row, idx) => {
                          const hasError = row.status === 'error';
                          const hasWarning = row.status === 'warning';
                          
                          return (
                            <tr 
                              key={idx} 
                              className={`hover:bg-slate-50/50 ${hasError ? 'bg-rose-50/25' : hasWarning ? 'bg-amber-50/25' : ''}`}
                            >
                              <td className="py-2 px-4 text-center text-slate-400 font-mono text-[10px] border-r border-slate-100">
                                {row.rowNum}
                              </td>
                              <td className="py-2 px-4">
                                <div className="font-semibold text-slate-850">{row.employee.name}</div>
                                {row.messages.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    {row.messages.map((msg, mIdx) => (
                                      <span 
                                        key={mIdx} 
                                        className={`inline-flex items-center gap-1 text-[9px] font-medium leading-none px-1.5 py-0.5 rounded-sm w-fit ${
                                          hasError ? 'bg-rose-100 text-rose-800' : 'bg-amber-105 text-amber-850'
                                        }`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                        {msg}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-4 font-mono text-slate-500">
                                {row.employee.cpf || '-'}
                              </td>
                              <td className="py-2 px-4 font-medium text-slate-700">
                                {row.cargoNameMatched || <span className="text-rose-500 italic font-normal">Ausente</span>}
                              </td>
                              <td className="py-2 px-4 text-slate-550">
                                {row.sectorNameMatched || <span className="text-slate-400 italic">Não Alocado</span>}
                              </td>
                              <td className="py-2 px-4 font-mono text-slate-500">
                                {row.employee.professionalRegistry || '-'}
                              </td>
                              <td className="py-2 px-4 text-slate-500">
                                {row.employee.admissionDate || '-'}
                              </td>
                              <td className="py-2 px-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  row.employee.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {row.employee.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary of processing */}
                  <div className="flex gap-4 text-xs font-medium text-slate-500 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                    <div>
                      Aptos para importação: <strong className="text-emerald-600">{importedRows.filter(r => r.status !== 'error').length}</strong>
                    </div>
                    <div className="w-px h-4 bg-slate-200"></div>
                    <div>
                      Com erros (serão ignorados): <strong className="text-rose-600">{importedRows.filter(r => r.status === 'error').length}</strong>
                    </div>
                    <div className="w-px h-4 bg-slate-200"></div>
                    <div>
                      Com avisos: <strong className="text-amber-600">{importedRows.filter(r => r.status === 'warning').length}</strong>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportedRows([]);
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Voltar
              </button>
              {importedRows.length > 0 && (
                <button
                  type="button"
                  disabled={isSavingImport || importedRows.filter(r => r.status !== 'error').length === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg shadow-sm hover:shadow transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingImport ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Importando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirmar Importação ({importedRows.filter(r => r.status !== 'error').length})
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
