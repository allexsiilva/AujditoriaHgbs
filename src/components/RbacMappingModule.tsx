import React, { useState, useContext, useMemo } from 'react';
import { AuthContext, Role, User } from '../context/AuthContext';
import { useAuditData } from '../context/AuditContext';
import { AVAILABLE_MODULES } from './AdminProfileManager';
import { 
  Users, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  Briefcase, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  UserPlus, 
  Save, 
  Info,
  Lock,
  Building2,
  ListFilter,
  Check,
  ChevronDown
} from 'lucide-react';

export function RbacMappingModule() {
  const { users, addUser, updateUser, cargos } = useContext(AuthContext);
  const { employees, sectors } = useAuditData();

  // Selected state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState<boolean>(false);

  // Form states for selected mapping
  const [selectedRole, setSelectedRole] = useState<Role>('USER');
  const [selectedCargoName, setSelectedCargoName] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPassword, setUserPassword] = useState<string>('');

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

  // Map sectors for label display
  const sectorMap = useMemo(() => {
    const map: Record<string, string> = {};
    sectors.forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [sectors]);

  // Filtered employees list based on search term
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(term) || 
      (emp.professionalRegistry && emp.professionalRegistry.toLowerCase().includes(term)) ||
      (emp.cpf && emp.cpf.includes(term))
    );
  }, [employees, searchTerm]);

  // Find the selected employee record
  const selectedEmployee = useMemo(() => {
    return employees.find(emp => emp.id === selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  // Find if there is an existing user account for this employee
  const existingUser = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return users.find(u => u.employeeId === selectedEmployeeId);
  }, [users, selectedEmployeeId]);

  // Handle employee selection
  const handleSelectEmployee = (empId: string) => {
    setSelectedEmployeeId(empId);
    setShowEmployeeDropdown(false);
    
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    
    setSearchTerm(emp.name); // Fill input with selected employee name

    // Find if user already exists
    const user = users.find(u => u.employeeId === empId);
    if (user) {
      setSelectedRole(user.role);
      setSelectedCargoName(user.cargo || '');
      setSelectedPermissions(user.permissions || []);
      setUserEmail(user.email);
      setUserPassword(''); // Keep blank unless resetting
    } else {
      // Auto-prefill form with default settings based on employee's cargoId or general cargo name
      setUserEmail(emp.email || '');
      setUserPassword('HospAudit123@'); // Standard provisional password
      
      // Attempt to match employee's cargoId with system Cargo profiles
      const matchingCargo = cargos.find(c => c.id === emp.cargoId || c.name.toLowerCase() === emp.cargoId.toLowerCase());
      if (matchingCargo) {
        setSelectedRole(matchingCargo.role);
        setSelectedCargoName(matchingCargo.name);
        setSelectedPermissions(matchingCargo.permissions);
      } else {
        setSelectedRole('USER');
        setSelectedCargoName(emp.cargoId || 'Colaborador');
        setSelectedPermissions(['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS']);
      }
    }
  };

  // Quick select dynamic cargo profile
  const handleApplyCargoProfile = (cargoId: string) => {
    const profile = cargos.find(c => c.id === cargoId);
    if (profile) {
      setSelectedRole(profile.role);
      setSelectedCargoName(profile.name);
      setSelectedPermissions(profile.permissions);
    }
  };

  // Toggle dynamic module permission
  const handleTogglePermission = (moduleId: string) => {
    setSelectedPermissions(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(p => p !== moduleId);
      } else {
        return [...prev, moduleId];
      }
    });
  };

  // Save the mapping / user configurations
  const handleSaveMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      setStatusMsg({ text: 'Selecione um funcionário válido no dropdown pesquisável.', type: 'error' });
      return;
    }
    if (!userEmail) {
      setStatusMsg({ text: 'Preencha o e-mail de acesso.', type: 'error' });
      return;
    }

    try {
      if (existingUser) {
        // Update user
        const updatePayload: Partial<User> = {
          name: selectedEmployee.name,
          email: userEmail,
          role: selectedRole,
          permissions: selectedPermissions,
          cargo: selectedCargoName,
          employeeId: selectedEmployee.id
        };
        if (userPassword) {
          updatePayload.password = userPassword;
        }
        updateUser(existingUser.id, updatePayload);
        setStatusMsg({ 
          text: `Mapeamento do colaborador "${selectedEmployee.name}" atualizado com sucesso no RBAC real-time!`, 
          type: 'success' 
        });
      } else {
        // Create user
        addUser({
          id: `user_emp_${selectedEmployee.id}`,
          name: selectedEmployee.name,
          email: userEmail,
          password: userPassword || 'HospAudit123@',
          role: selectedRole,
          permissions: selectedPermissions,
          cargo: selectedCargoName,
          employeeId: selectedEmployee.id
        });
        setStatusMsg({ 
          text: `Novo mapeamento RBAC criado! Login de acesso configurado para "${selectedEmployee.name}".`, 
          type: 'success' 
        });
      }

      setTimeout(() => {
        setStatusMsg({ text: '', type: '' });
      }, 4000);
    } catch (err: any) {
      setStatusMsg({ text: 'Falha ao salvar mapeamento: ' + err.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <Key className="w-5 h-5 text-indigo-600" /> Vínculo & RBAC Avançado de Funcionários
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Associe funcionários registrados à credenciais de login, mapeando cargos e controlando permissões individuais de forma imediata.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Searchable Combobox & Basic Info */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-3xs space-y-5 lg:col-span-1">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-500" /> 1. Escolher Funcionário
          </h4>

          {/* Searchable Combobox */}
          <div className="relative">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Buscar Funcionário (Nome, CPF ou Registro)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: Dra. Ana Paula..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setShowEmployeeDropdown(true);
                  if (selectedEmployeeId && e.target.value !== selectedEmployee?.name) {
                    setSelectedEmployeeId('');
                  }
                }}
                onFocus={() => setShowEmployeeDropdown(true)}
                className="w-full pl-9 pr-8 py-2 border border-slate-250 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedEmployeeId('');
                    setShowEmployeeDropdown(false);
                  }}
                  className="absolute right-3 top-2 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 font-bold text-xs"
                >
                  ×
                </button>
              )}
            </div>

            {/* Dropdown Box */}
            {showEmployeeDropdown && filteredEmployees.length > 0 && (
              <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-md max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredEmployees.map(emp => {
                  const hasAccount = users.some(u => u.employeeId === emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleSelectEmployee(emp.id)}
                      className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{emp.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {emp.professionalRegistry ? `Registro: ${emp.professionalRegistry}` : 'Sem registro'} • {sectorMap[emp.sectorId || ''] || 'Sem Setor'}
                        </p>
                      </div>
                      {hasAccount ? (
                        <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold uppercase shrink-0">
                          Mapeado
                        </span>
                      ) : (
                        <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-md font-bold uppercase shrink-0">
                          Pendente
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Employee Info summary Card */}
          {selectedEmployee ? (
            <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-3xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold uppercase px-2 py-0.5 rounded-md">
                  Ficha do Funcionário
                </span>
                <span className={`w-2 h-2 rounded-full ${selectedEmployee.status === 'ATIVO' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </div>
              <p className="font-black text-xs text-slate-800 leading-tight">{selectedEmployee.name}</p>
              <div className="text-[10px] text-slate-500 font-semibold space-y-1">
                <p className="flex items-center gap-1"><Building2 size={12} className="text-slate-400" /> Setor: {sectorMap[selectedEmployee.sectorId || ''] || 'Não definido'}</p>
                <p className="flex items-center gap-1"><Briefcase size={12} className="text-slate-400" /> Cargo: {selectedEmployee.cargoId}</p>
                {selectedEmployee.professionalRegistry && (
                  <p className="flex items-center gap-1 font-mono text-[9px] bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded w-fit text-slate-600 mt-1">
                    Reg: {selectedEmployee.professionalRegistry}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[11px] font-medium text-center py-6">
              Nenhum colaborador selecionado. Busque no campo acima para definir ou visualizar os privilégios.
            </div>
          )}

          {/* Account Credentials mapping */}
          {selectedEmployee && (
            <div className="space-y-3 pt-3 border-t border-slate-200/60">
              <h5 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">Credenciais de Acesso</h5>
              
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-500 font-bold uppercase">E-mail de Login</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                  placeholder="ana@hospital.com"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-slate-500 font-bold uppercase">
                  {existingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha de Acesso'}
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono"
                  placeholder={existingUser ? '••••••••' : 'Senha inicial provisória'}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: RBAC Configuration & Modules Assign */}
        <div className="lg:col-span-2 space-y-5">
          {selectedEmployeeId ? (
            <form onSubmit={handleSaveMapping} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs space-y-5 text-slate-700">
              {/* Top Banner Status */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                      {existingUser ? '✏️ Ajustar RBAC Ativo' : '➕ Configurar Nova Conta de Acesso'}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {existingUser ? 'Conta de sistema vinculada. Modificações aplicadas em tempo real.' : 'Crie credenciais e escolha quais permissões atribuir.'}
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer border-none"
                >
                  <Save className="w-4 h-4" /> Salvar Mapeamento
                </button>
              </div>

              {/* Status Message */}
              {statusMsg.text && (
                <div className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center gap-2 animate-in fade-in ${
                  statusMsg.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                  <span>{statusMsg.text}</span>
                </div>
              )}

              {/* Access Levels & Cargo profiles selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Nível de Acesso (Role)
                  </label>
                  <select
                    value={selectedRole}
                    onChange={e => {
                      const role = e.target.value as Role;
                      setSelectedRole(role);
                      if (role === 'MASTER') {
                        setSelectedPermissions(['ALL']);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="USER">Usuário Assistencial / Comum</option>
                    <option value="ADMIN">Administrador</option>
                    <option value="MASTER">Master (Acesso Irrestrito)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Aplicar Perfil de Cargo
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={cargos.some(c => c.name === selectedCargoName) ? cargos.find(c => c.name === selectedCargoName)?.id : 'custom'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setSelectedCargoName(selectedEmployee.cargoId || 'Colaborador');
                        } else {
                          handleApplyCargoProfile(val);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                    >
                      <option value="custom">-- Cargo Personalizado / Livre --</option>
                      {cargos.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-1">
                  <label className="block text-[10px] text-slate-500 font-bold uppercase">Nome do Cargo Exibido</label>
                  <input
                    type="text"
                    value={selectedCargoName}
                    onChange={e => setSelectedCargoName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                    placeholder="Ex: Auditor Clínico Sênior"
                  />
                </div>
              </div>

              {/* Dynamic Module Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Lock className="w-4 h-4 text-indigo-500" /> 2. Módulos Autorizados
                  </h5>
                  {selectedRole === 'MASTER' && (
                    <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-black uppercase">
                      Acesso Irrestrito Ativo
                    </span>
                  )}
                </div>

                {selectedRole === 'MASTER' ? (
                  <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl text-xs text-purple-800 leading-relaxed font-semibold">
                    Usuários com nível de acesso <strong>MASTER</strong> possuem permissões absolutas automáticas. Não é necessário conceder módulos individualmente.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {AVAILABLE_MODULES.map(module => {
                      const isChecked = selectedPermissions.includes(module.id);
                      return (
                        <label
                          key={module.id}
                          className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${
                            isChecked 
                              ? 'bg-indigo-50/60 border-indigo-200 text-indigo-900 shadow-3xs' 
                              : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(module.id)}
                            className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer shrink-0"
                          />
                          <div className="text-left min-w-0">
                            <p className="text-xs font-extrabold tracking-tight text-slate-800 leading-none flex items-center gap-1.5">
                              {module.name}
                              {isChecked && <Check size={11} className="text-indigo-600 font-bold shrink-0" />}
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium mt-1 line-clamp-1">
                              {module.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400 space-y-3">
              <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="font-extrabold text-sm text-slate-700 uppercase tracking-wide">Pendente de Seleção</h4>
              <p className="text-xs max-w-sm mx-auto leading-relaxed">
                Escolha um colaborador no dropdown pesquisável à esquerda para carregar, vincular e editar as políticas de permissão de acesso ao sistema em tempo real.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
