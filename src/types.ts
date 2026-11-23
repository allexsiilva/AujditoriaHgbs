export interface Sector {
  id: string;
  name: string;
  description: string;
}

export interface Bed {
  id: string;
  number: string;
  sectorId: string;
}

export interface AuditRecord {
  id: string;
  date: string;
  sectorId: string;
  bedId: string;
  type: 'IRAS' | 'SAFETY';
  answers: Record<string, string>;
  evaluator: string;
  status?: 'ATIVO' | 'INATIVO';
}

export interface AuditQuestion {
  id: string;
  formType: 'IRAS' | 'SAFETY';
  section: string;
  label: string;
  options: string[];
}

export interface Patient {
  id: string;
  name: string;
  record: string; // Prontuário
  cpf?: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'O';
  admissionDate: string;
  sectorId: string;
  bedId: string;
  diagnosis?: string;
  status: 'INTERNADO' | 'ALTA' | 'TRANSFERIDO';
  history?: string[];
  triages?: any[];
}

export interface Equipment {
  id: string;
  name: string;
  serialNumber: string;
  model: string;
  brand: string;
  sectorId: string;
  purchaseDate: string;
  status: 'ATIVO' | 'MANUTENCAO' | 'INATIVO';
}

export interface Maintenance {
  id: string;
  equipmentId: string;
  type: 'PREVENTIVA' | 'CORRETIVA';
  scheduledDate: string;
  performedDate: string | null;
  technician: string;
  description: string;
  cost: number;
  status: 'PENDENTE' | 'CONCLUIDA';
  notes?: string;
}

export interface Part {
  id: string;
  name: string;
  code: string;
  manufacturer: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  equipmentId?: string;
}

export interface Employee {
  id: string;
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  cargoId: string;
  sectorId?: string;
  status: 'ATIVO' | 'INATIVO';
  admissionDate?: string;
  professionalRegistry?: string;
}


