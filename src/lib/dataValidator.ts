import { Sector, Bed, AuditRecord, AuditQuestion, Patient } from '../types';

/**
 * DataValidator - Utility class for data validation and sanitization (Middleware).
 * Runs before persistence operations to ensure data integrity and prevent DB errors.
 */
export class DataValidator {
  
  /**
   * Sanitizes a string by trimming it and stripping dangerous characters (such as HTML tags).
   */
  private static sanitizeString(val: any, maxLength?: number): string {
    if (val === undefined || val === null) return '';
    let str = String(val).trim();
    
    // Simple HTML/JS tag stripping to prevent XSS
    str = str.replace(/<[^>]*>?/gm, '');
    
    if (maxLength && str.length > maxLength) {
      str = str.substring(0, maxLength);
    }
    return str;
  }

  /**
   * Validates a date string to ensure it's in a recognizable format.
   */
  private static isValidDate(dateStr: string): boolean {
    if (!dateStr) return false;
    const timestamp = Date.parse(dateStr);
    return !isNaN(timestamp);
  }

  /**
   * Validates and sanitizes payload for a given action.
   * Throws an Error if validation fails. Returns the sanitized payload.
   */
  public static validateAndSanitize(action: string, payload: any): any {
    if (!payload || typeof payload !== 'object') {
      throw new Error('O payload enviado para persistência é inválido ou nulo.');
    }

    // Clone payload to avoid side effects on UI states
    const data = JSON.parse(JSON.stringify(payload));

    switch (action) {
      // --- SECTOR VALIDATIONS ---
      case 'add_sector':
      case 'update_sector': {
        if (action === 'update_sector' && !data.id) {
          throw new Error('Ação de atualização de setor requer um ID válido.');
        }
        
        data.id = this.sanitizeString(data.id || '');
        data.name = this.sanitizeString(data.name || '', 100);
        data.description = this.sanitizeString(data.description || '', 255);

        if (!data.name || data.name.length < 2) {
          throw new Error('O nome do setor é obrigatório e deve conter pelo menos 2 caracteres.');
        }
        break;
      }

      // --- BED VALIDATIONS ---
      case 'add_bed':
      case 'update_bed': {
        if (action === 'update_bed' && !data.id) {
          throw new Error('Ação de atualização de leito requer um ID válido.');
        }

        data.id = this.sanitizeString(data.id || '');
        data.number = this.sanitizeString(data.number || '', 50);
        data.sectorId = this.sanitizeString(data.sectorId || '');

        if (!data.number) {
          throw new Error('O número do leito é obrigatório.');
        }
        if (!data.sectorId) {
          throw new Error('O leito deve estar associado a um setor válido.');
        }
        break;
      }

      // --- AUDIT VALIDATIONS ---
      case 'add_audit':
      case 'update_audit': {
        if (action === 'update_audit' && !data.id) {
          throw new Error('Ação de atualização de auditoria requer um ID válido.');
        }

        data.id = this.sanitizeString(data.id || '');
        data.evaluator = this.sanitizeString(data.evaluator || '', 100);
        data.sectorId = this.sanitizeString(data.sectorId || '');
        data.bedId = this.sanitizeString(data.bedId || '');
        data.type = this.sanitizeString(data.type || '') as 'IRAS' | 'SAFETY';
        
        if (!data.evaluator || data.evaluator.length < 2) {
          throw new Error('O nome do auditor/avaliador é obrigatório.');
        }
        if (!data.sectorId) {
          throw new Error('A auditoria deve estar associada a um setor válido.');
        }
        if (!data.bedId) {
          throw new Error('A auditoria deve estar associada a um leito válido.');
        }
        if (data.type !== 'IRAS' && data.type !== 'SAFETY') {
          throw new Error('O tipo da auditoria deve ser IRAS ou SAFETY.');
        }
        if (!data.date || !this.isValidDate(data.date)) {
          data.date = new Date().toISOString();
        } else {
          data.date = new Date(data.date).toISOString();
        }

        if (!data.answers || typeof data.answers !== 'object') {
          throw new Error('As respostas do checklist são obrigatórias.');
        }

        // Sanitize all answer keys and values
        const sanitizedAnswers: Record<string, string> = {};
        for (const [key, value] of Object.entries(data.answers)) {
          const sanitizedKey = this.sanitizeString(key);
          const sanitizedValue = this.sanitizeString(value);
          if (sanitizedKey) {
            sanitizedAnswers[sanitizedKey] = sanitizedValue;
          }
        }
        data.answers = sanitizedAnswers;
        break;
      }

      // --- QUESTION VALIDATIONS ---
      case 'add_question':
      case 'update_question': {
        if (action === 'update_question' && !data.id) {
          throw new Error('Ação de atualização de pergunta requer um ID válido.');
        }

        data.id = this.sanitizeString(data.id || '');
        data.formType = this.sanitizeString(data.formType || '') as 'IRAS' | 'SAFETY';
        data.section = this.sanitizeString(data.section || '', 100);
        data.label = this.sanitizeString(data.label || '', 500);

        if (!data.label) {
          throw new Error('O texto da pergunta é obrigatório.');
        }
        if (!data.section) {
          throw new Error('A seção/categoria da pergunta é obrigatória.');
        }
        if (data.formType !== 'IRAS' && data.formType !== 'SAFETY') {
          throw new Error('O tipo do formulário deve ser IRAS ou SAFETY.');
        }

        if (Array.isArray(data.options)) {
          data.options = data.options.map((opt: any) => this.sanitizeString(opt)).filter(Boolean);
        } else {
          data.options = ['Sim', 'Não', 'N/A'];
        }
        break;
      }

      // --- PATIENT VALIDATIONS ---
      case 'add_patient':
      case 'update_patient': {
        if (action === 'update_patient' && !data.id) {
          throw new Error('Ação de atualização de paciente requer um ID válido.');
        }

        data.id = this.sanitizeString(data.id || '');
        data.name = this.sanitizeString(data.name || '', 150);
        data.record = this.sanitizeString(data.record || '', 50);
        data.cpf = this.sanitizeString(data.cpf || '', 20).replace(/[^\d]/g, ''); // leave only numbers
        data.sectorId = this.sanitizeString(data.sectorId || '');
        data.bedId = this.sanitizeString(data.bedId || '');
        data.diagnosis = this.sanitizeString(data.diagnosis || '', 255);
        data.status = this.sanitizeString(data.status || '') as 'INTERNADO' | 'ALTA' | 'TRANSFERIDO';

        if (!data.name || data.name.length < 3) {
          throw new Error('O nome do paciente é obrigatório e deve conter pelo menos 3 caracteres.');
        }
        if (!data.record) {
          throw new Error('O número de prontuário do paciente é obrigatório.');
        }
        if (!data.sectorId) {
          throw new Error('O paciente deve estar associado a um setor.');
        }
        if (!data.bedId) {
          throw new Error('O paciente deve estar associado a um leito.');
        }
        if (!data.status || !['INTERNADO', 'ALTA', 'TRANSFERIDO'].includes(data.status)) {
          data.status = 'INTERNADO';
        }

        if (data.birthDate) {
          if (!this.isValidDate(data.birthDate)) {
            throw new Error('A data de nascimento informada é inválida.');
          }
          data.birthDate = data.birthDate.substring(0, 10); // YYYY-MM-DD
        }

        if (!data.admissionDate || !this.isValidDate(data.admissionDate)) {
          data.admissionDate = new Date().toISOString().substring(0, 10);
        } else {
          data.admissionDate = new Date(data.admissionDate).toISOString().substring(0, 10);
        }

        if (data.gender && !['M', 'F', 'O'].includes(data.gender)) {
          data.gender = 'O';
        }
        break;
      }

      // --- DELETE OPERATIONS ---
      case 'delete_sector':
      case 'delete_bed':
      case 'delete_audit':
      case 'delete_question':
      case 'delete_patient':
      case 'delete_user':
      case 'delete_cargo':
      case 'delete_custom_module':
      case 'delete_form_submission': {
        data.id = this.sanitizeString(data.id || '');
        if (!data.id) {
          throw new Error('Ação de exclusão requer um ID de recurso válido.');
        }
        break;
      }

      // --- USER & CARGO OPERATIONS ---
      case 'add_user':
      case 'update_user': {
        if (action === 'update_user' && !data.id) {
          throw new Error('Ação de atualização de usuário requer um ID válido.');
        }
        data.id = this.sanitizeString(data.id || '');
        if (action === 'add_user') {
          data.name = this.sanitizeString(data.name || '', 100);
          data.email = this.sanitizeString(data.email || '', 100).toLowerCase();
          data.password = this.sanitizeString(data.password || '');
          data.role = this.sanitizeString(data.role || 'USER');
          data.cargo = this.sanitizeString(data.cargo || '');
          if (Array.isArray(data.permissions)) {
            data.permissions = data.permissions.map((p: any) => this.sanitizeString(p));
          } else {
            data.permissions = [];
          }
        } else {
          // For update_user, only sanitize and set keys if they are explicitly present
          if (data.name !== undefined) {
            data.name = this.sanitizeString(data.name, 100);
          }
          if (data.email !== undefined) {
            data.email = this.sanitizeString(data.email, 100).toLowerCase();
          }
          if (data.password !== undefined) {
            data.password = this.sanitizeString(data.password);
          }
          if (data.role !== undefined) {
            data.role = this.sanitizeString(data.role);
          }
          if (data.cargo !== undefined) {
            data.cargo = this.sanitizeString(data.cargo);
          }
          if (data.permissions !== undefined) {
            if (Array.isArray(data.permissions)) {
              data.permissions = data.permissions.map((p: any) => this.sanitizeString(p));
            } else {
              data.permissions = [];
            }
          }
        }
        break;
      }

      case 'add_cargo':
      case 'update_cargo': {
        if (action === 'update_cargo' && !data.id) {
          throw new Error('Ação de atualização de cargo requer um ID válido.');
        }
        data.id = this.sanitizeString(data.id || '');
        data.name = this.sanitizeString(data.name || '', 100);
        data.description = this.sanitizeString(data.description || '', 255);
        if (Array.isArray(data.permissions)) {
          data.permissions = data.permissions.map((p: any) => this.sanitizeString(p));
        } else {
          data.permissions = [];
        }
        break;
      }

      case 'update_permissions': {
        if (Array.isArray(data.permissions)) {
          data.permissions = data.permissions.map((p: any) => ({
            cargo_id: this.sanitizeString(p.cargo_id),
            modulo_id: this.sanitizeString(p.modulo_id),
            pode_visualizar: Number(p.pode_visualizar) || 0,
            pode_criar_editar: Number(p.pode_criar_editar) || 0,
            pode_deletar: Number(p.pode_deletar) || 0,
            itens: typeof p.itens === 'string' ? p.itens : JSON.stringify(p.itens || [])
          }));
        } else {
          data.permissions = [];
        }
        break;
      }

      case 'update_module_status': {
        data.modulo_id = this.sanitizeString(data.modulo_id || '');
        data.status = Number(data.status) || 0;
        break;
      }

      case 'create_custom_module': {
        data.id = this.sanitizeString(data.id || '');
        data.name = this.sanitizeString(data.name || '', 100);
        data.category = this.sanitizeString(data.category || '', 100);
        data.description = this.sanitizeString(data.description || '', 255);
        if (Array.isArray(data.items)) {
          data.items = data.items.map((it: any) => this.sanitizeString(it));
        } else {
          data.items = [];
        }
        break;
      }

      case 'add_form_submission': {
        data.id = this.sanitizeString(data.id || '');
        data.type = this.sanitizeString(data.type || 'LESAO');
        data.date = this.sanitizeString(data.date || '');
        data.evaluator = this.sanitizeString(data.evaluator || '');
        data.patientName = this.sanitizeString(data.patientName || '');
        data.patientRecord = this.sanitizeString(data.patientRecord || '');
        break;
      }

      case 'add_equipment':
      case 'update_equipment': {
        if (action === 'update_equipment' && !data.id) {
          throw new Error('Ação de atualização de equipamento requer um ID válido.');
        }
        data.id = this.sanitizeString(data.id || '');
        data.name = this.sanitizeString(data.name || '', 150);
        data.serialNumber = this.sanitizeString(data.serialNumber || '', 100);
        data.model = this.sanitizeString(data.model || '', 100);
        data.brand = this.sanitizeString(data.brand || '', 100);
        data.sectorId = this.sanitizeString(data.sectorId || '');
        data.purchaseDate = this.sanitizeString(data.purchaseDate || '');
        data.status = this.sanitizeString(data.status || 'ATIVO');
        
        if (!data.name) {
          throw new Error('O nome do equipamento é obrigatório.');
        }
        if (!data.serialNumber) {
          throw new Error('O número de série é obrigatório.');
        }
        break;
      }

      case 'delete_equipment': {
        data.id = this.sanitizeString(data.id || '');
        break;
      }

      case 'add_maintenance':
      case 'update_maintenance': {
        if (action === 'update_maintenance' && !data.id) {
          throw new Error('Ação de atualização de manutenção requer um ID válido.');
        }
        data.id = this.sanitizeString(data.id || '');
        data.equipmentId = this.sanitizeString(data.equipmentId || '');
        data.type = this.sanitizeString(data.type || 'PREVENTIVA');
        data.scheduledDate = this.sanitizeString(data.scheduledDate || '');
        data.performedDate = data.performedDate ? this.sanitizeString(data.performedDate) : null;
        data.technician = this.sanitizeString(data.technician || '', 150);
        data.description = this.sanitizeString(data.description || '', 500);
        data.cost = Number(data.cost) || 0;
        data.status = this.sanitizeString(data.status || 'PENDENTE');
        data.notes = this.sanitizeString(data.notes || '', 500);

        if (!data.equipmentId) {
          throw new Error('A ordem de manutenção requer um equipamento associado.');
        }
        if (!data.scheduledDate) {
          throw new Error('A data agendada é obrigatória.');
        }
        break;
      }

      case 'delete_maintenance': {
        data.id = this.sanitizeString(data.id || '');
        break;
      }

      case 'add_log': {
        data.user = this.sanitizeString(data.user || 'Sistema', 100);
        data.action = this.sanitizeString(data.action || '', 100);
        data.details = this.sanitizeString(data.details || '', 500);
        break;
      }

      case 'clear_audits': {
        break;
      }
    }

    return data;
  }
}
