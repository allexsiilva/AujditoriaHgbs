import { Sector, Bed, AuditRecord, AuditQuestion, Patient, Equipment, Maintenance, Employee } from '../types';

const originalFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : null;
const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!originalFetch) return new Response(JSON.stringify({ success: false, message: 'Fetch not available in server context' }));
  try {
    const res = await originalFetch(input, init);
    return res;
  } catch (e: any) {
    const errMsg = `Erro de rede ou conexão recusada: ${e.message || String(e)}`;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hospaudit_last_api_error', errMsg);
    }
    throw new Error(errMsg);
  }
};

export class PhpRepository {
  private static getHeaders() {
    let userEmail = '';
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('hospaudit_current_user') || window.sessionStorage.getItem('hospaudit_current_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            userEmail = parsed.email;
          }
        }
      } catch (e) {
        console.warn('Error reading current user for headers', e);
      }
    }
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(userEmail ? { 'X-User-Email': userEmail } : {})
    };
  }

  private static async handleResponse(res: Response) {
    const contentType = res.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = (await res.text()).trim();
      const cleanText = text.substring(0, 300);
      const errMsg = cleanText || `Erro HTTP ${res.status}: ${res.statusText}`;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('hospaudit_last_api_error', errMsg);
      }
      throw new Error(errMsg);
    }

    if (!res.ok || data.success === false) {
      const errMsg = data.message || 'Erro desconhecido ao processar requisição.';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('hospaudit_last_api_error', errMsg);
      }
      throw new Error(errMsg);
    }

    // Clear error on success
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('hospaudit_last_api_error');
    }
    return data;
  }

  // GET ALL DATA (Consolidated fetch with optional lazy pagination)
  public static async getAllData(page?: number, limit?: number): Promise<any> {
    let url = '/api.php?action=get_data';
    if (page !== undefined && limit !== undefined) {
      url += `&page=${page}&limit=${limit}`;
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(res);
  }

  // SECTOR OPERATIONS
  public static async addSector(sector: Sector): Promise<boolean> {
    const res = await fetch('/api.php?action=add_sector', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(sector)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateSector(sector: Sector): Promise<boolean> {
    const res = await fetch('/api.php?action=update_sector', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(sector)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteSector(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_sector', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // BED OPERATIONS
  public static async addBed(bed: Bed): Promise<boolean> {
    const res = await fetch('/api.php?action=add_bed', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(bed)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteBed(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_bed', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateBed(bed: Bed): Promise<boolean> {
    const res = await fetch('/api.php?action=update_bed', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(bed)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // PATIENT OPERATIONS
  public static async addPatient(patient: Patient): Promise<boolean> {
    const res = await fetch('/api.php?action=add_patient', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(patient)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updatePatient(patient: Patient): Promise<boolean> {
    const res = await fetch('/api.php?action=update_patient', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(patient)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deletePatient(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_patient', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // EQUIPMENT OPERATIONS
  public static async addEquipment(equipment: Equipment): Promise<boolean> {
    const res = await fetch('/api.php?action=add_equipment', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(equipment)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateEquipment(equipment: Equipment): Promise<boolean> {
    const res = await fetch('/api.php?action=update_equipment', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(equipment)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteEquipment(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_equipment', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // MAINTENANCE OPERATIONS
  public static async addMaintenance(maintenance: Maintenance): Promise<boolean> {
    const res = await fetch('/api.php?action=add_maintenance', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(maintenance)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateMaintenance(maintenance: Maintenance): Promise<boolean> {
    const res = await fetch('/api.php?action=update_maintenance', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(maintenance)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteMaintenance(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_maintenance', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // AUDIT OPERATIONS
  public static async addAudit(audit: AuditRecord): Promise<boolean> {
    const res = await fetch('/api.php?action=add_audit', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(audit)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateAudit(audit: AuditRecord): Promise<boolean> {
    const res = await fetch('/api.php?action=update_audit', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(audit)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteAudit(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_audit', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // QUESTION OPERATIONS
  public static async addQuestion(question: AuditQuestion): Promise<boolean> {
    const res = await fetch('/api.php?action=add_question', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(question)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateQuestion(question: AuditQuestion): Promise<boolean> {
    const res = await fetch('/api.php?action=update_question', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(question)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteQuestion(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_question', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // LOG OPERATIONS
  public static async addLog(log: any): Promise<boolean> {
    const res = await fetch('/api.php?action=add_log', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(log)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  // EMPLOYEE OPERATIONS
  public static async addEmployee(employee: Employee): Promise<boolean> {
    const res = await fetch('/api.php?action=add_employee', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(employee)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async importEmployeesBatch(employees: Employee[]): Promise<boolean> {
    const res = await fetch('/api.php?action=import_employees_batch', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ employees })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async updateEmployee(employee: Employee): Promise<boolean> {
    const res = await fetch('/api.php?action=update_employee', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(employee)
    });
    const data = await this.handleResponse(res);
    return data.success;
  }

  public static async deleteEmployee(id: string): Promise<boolean> {
    const res = await fetch('/api.php?action=delete_employee', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id })
    });
    const data = await this.handleResponse(res);
    return data.success;
  }
}
