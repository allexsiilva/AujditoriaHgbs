import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DEFAULT_QUESTION_LABELS_MAP: Record<string, string> = {
  cs_1: 'Aspecto do local de inserção',
  cs_2: 'Óstio não visível',
  cs_3: 'Presença de sinais flogísticos',
  cs_4: 'Todas as saídas não utilizadas estão protegidas?',
  cs_5: 'Tipo do cateter',
  cs_6: 'Tipo do curativo',
  cs_7: 'Curativo conforme indicação?',
  cs_8: 'Curativo estéril totalmente aderido a pele?',
  cs_9: 'Permite Visualização?',
  cs_10: 'Curativo limpo e seco?',
  cs_11: 'Curativo dentro da validade?',
  cs_12: 'Conector sem resíduo de sangue?',
  pav_1: 'Cavidade oral limpa?',
  pav_2: 'Higiene oral de acordo com o protocolo do hospital?',
  pav_3: 'Condensador de filtro (TOT)',
  pav_4: 'Cabeceira da cama elevada (30 a 45º)',
  pav_5: 'Mensurada pressão do cuff > 25cmh2o?',
  pav_6: 'O nível de sedação ta dentro da meta estipulada?',
  svd_1: 'Há indicação de retirada do dispositivo?',
  svd_2: 'Fixação da sonda adequada?',
  svd_3: 'Fluxo de urina sem dobra, grumos?',
  svd_4: 'Capacidade de bolsa até 2/3?',
  svd_5: 'Bolsa coletora abaixo da cintura e longe do chão (pelo menos)?',
  svd_6: 'Sistema (SVD + bolsa coletora) está conectado e sem vazamentos?',
  id_1: 'O paciente possui placa de identificação?',
  id_2: 'O paciente possui pulseira de identificação?',
  id_3: 'A pulseira contém pelo menos dois identificadores (ex: nome completo, data de nascimento e nome da mãe)?',
  id_4: 'Os dados da pulseira conferem com o prontuário/medicamentos?',
  id_5: 'A equipe verifica a identificação antes de procedimentos/medicações?',
  cm_1: 'A transferência interna de pacientes segue método estruturado (ex: SBAR)?',
  cm_2: 'Solicitação médica de vaga de UTI?',
  cm_3: 'Sumário de alta hospitalar?',
  cm_4: 'Solicitação/ parecer de avaliação de especialista?',
  cm_5: 'Solicitação de avaliação/ parecer do especialista respondida?',
  md_1: 'A dupla checagem é realizada antes da administração?',
  md_2: 'Aprazamento e checagem corretos?',
  md_3: 'Alergia medicamentosa informada?',
  cg_1: 'A marcação do sítio cirúrgico é feita antes de levar o paciente à sala?',
  cg_2: 'O checklist de Cirurgia Segura (Time-out) é preenchido no prontuário?',
  cg_3: 'O termo de consentimento está assinado e disponível?',
  ri_1: 'Profissionais higienizam as mãos nos 5 momentos (OMS)?',
  ri_2: 'Há pias com sabonete/papel e dispensadores de álcool gel disponíveis?',
  ri_3: 'Dispositivos (sondas/cateteres/ acesso) estão com data de inserção e fixação correta?',
  ql_1: 'Avaliação de risco de queda/lesão por pressão é feita na admissão e diariamente?',
  ql_2: 'Grades do leito estão elevadas e rodas travadas?',
  ql_3: 'Plano de cuidados inclui mudança de decúbito e hidratação da pele?',
};

export function getAnswerForQuestion(
  answers: Record<string, string> | undefined | null,
  q: { id: string; label: string },
  allQuestions: { id: string; label: string }[]
): string {
  if (!answers) return '';
  
  const qId = q.id;
  // 1. Direct ID match
  if (answers[qId] !== undefined && answers[qId] !== '') {
    return answers[qId];
  }

  // Normalize current label for comparison
  const qNorm = q.label.toLowerCase().trim().replace(/[?.:;]/g, '');

  // 2. Fallback: match by label in allQuestions
  for (const otherQ of allQuestions) {
    if (otherQ.id !== qId) {
      const otherNorm = otherQ.label.toLowerCase().trim().replace(/[?.:;]/g, '');
      if (otherNorm === qNorm && answers[otherQ.id] !== undefined && answers[otherQ.id] !== '') {
        return answers[otherQ.id];
      }
    }
  }

  // 3. Fallback: match by flexible keyword mapping and default questions
  const keys = Object.keys(answers);
  for (const key of keys) {
    const val = answers[key];
    if (val !== undefined && val !== '') {
      // Find what question had this key
      const otherQ = allQuestions.find(item => item.id === key);
      let otherLabel = otherQ ? otherQ.label : DEFAULT_QUESTION_LABELS_MAP[key];
      
      if (otherLabel) {
        const otherNorm = otherLabel.toLowerCase().trim().replace(/[?.:;]/g, '');
        
        // Exact normalized match of legacy/alternative question
        if (otherNorm === qNorm) {
          return val;
        }

        // Logical synonyms / semantic mapping
        const isConectorQ = qNorm.includes('conector') || qNorm.includes('sangue');
        const isConectorRel = otherNorm.includes('conector') || otherNorm.includes('sangue');
        
        const isOstioQ = qNorm.includes('óstio') || qNorm.includes('visib');
        const isOstioRel = otherNorm.includes('óstio') || otherNorm.includes('visib');
        
        const isCurativoAderidoQ = qNorm.includes('curativo') && qNorm.includes('aderi');
        const isCurativoAderidoRel = otherNorm.includes('curativo') && otherNorm.includes('aderi');

        const isCurativoLimpoQ = qNorm.includes('curativo') && qNorm.includes('limpo');
        const isCurativoLimpoRel = otherNorm.includes('curativo') && otherNorm.includes('limpo');

        const isCurativoValidadeQ = qNorm.includes('curativo') && qNorm.includes('valida');
        const isCurativoValidadeRel = otherNorm.includes('curativo') && otherNorm.includes('valida');
        
        if (isConectorQ && isConectorRel) return val;
        if (isOstioQ && isOstioRel) return val;
        if (isCurativoAderidoQ && isCurativoAderidoRel) return val;
        if (isCurativoLimpoQ && isCurativoLimpoRel) return val;
        if (isCurativoValidadeQ && isCurativoValidadeRel) return val;
      } else {
        const keyNorm = key.toLowerCase().trim().replace(/[?.:;]/g, '');
        if (keyNorm === qNorm) {
          return val;
        }
      }
    }
  }

  return '';
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Sem data';
  const trimmed = dateStr.trim();
  if (!trimmed) return 'Sem data';

  let datePart = '';
  let timePart = '';

  if (trimmed.includes('T')) {
    const parts = trimmed.split('T');
    datePart = parts[0];
    timePart = parts[1] ? parts[1].substring(0, 8) : '';
  } else if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ');
    datePart = parts[0];
    timePart = parts[1] ? parts[1].substring(0, 8) : '';
  } else {
    datePart = trimmed;
  }

  const dateSubparts = datePart.split('-');
  if (dateSubparts.length === 3) {
    const formattedDate = `${dateSubparts[2]}/${dateSubparts[1]}/${dateSubparts[0]}`;
    if (timePart) {
      const cleanTime = timePart.replace(/Z|[-+].*$/, '');
      return `${formattedDate} ${cleanTime}`;
    }
    return formattedDate;
  }

  return trimmed;
}

export interface YMD {
  year: number;
  month: number;
  day: number;
}

export function getYearMonthDay(dateStr: string | undefined | null): YMD | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  
  // YYYY-MM-DD format (with or without time)
  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10)
    };
  }
  
  // DD/MM/YYYY format (with or without time)
  match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return {
      year: parseInt(match[3], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[1], 10)
    };
  }

  return null;
}

export function parseDateToTimestamp(dateStr: string | undefined | null): number {
  const ymd = getYearMonthDay(dateStr);
  if (!ymd) return 0;
  return new Date(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0).getTime();
}

export const numericCollator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base'
});

export function calculateAuditConformity(answers: Record<string, string> | undefined | null): {
  totalAnswered: number;
  positiveAnswers: number;
  naAnswers: number;
  negativeAnswers: number;
  conformityScore: number;
} {
  if (!answers) {
    return { totalAnswered: 0, positiveAnswers: 0, naAnswers: 0, negativeAnswers: 0, conformityScore: 0 };
  }

  let totalAnswered = 0;
  let positiveAnswers = 0;
  let naAnswers = 0;

  for (const key in answers) {
    if (Object.prototype.hasOwnProperty.call(answers, key)) {
      const val = answers[key];
      totalAnswered++;
      if (val === 'S' || val === 'Sim') {
        positiveAnswers++;
      } else if (val === 'NA') {
        naAnswers++;
      }
    }
  }

  const negativeAnswers = totalAnswered - positiveAnswers - naAnswers;
  const totalEligible = totalAnswered - naAnswers;
  const conformityScore = totalEligible > 0 ? Math.round((positiveAnswers / totalEligible) * 100) : 0;

  return { totalAnswered, positiveAnswers, naAnswers, negativeAnswers, conformityScore };
}


