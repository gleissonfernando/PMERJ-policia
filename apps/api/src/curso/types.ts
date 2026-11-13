/** Um curso cadastrado pela administração. */
export interface CursoConfig {
  id: string;
  nome: string;
  sigla: string;
  descricao: string;
  /** Desativado: não abre turmas novas. Quem já tem o curso continua com ele no /perfil. */
  ativo: boolean;
  /** Patente mínima para entrar (id das patentes do Pedir Set). null = qualquer. */
  patenteMinimaId: string | null;
  /** Cargo do Discord entregue a quem conclui o curso. */
  cargoId: string | null;
  /** Instrutores SÓ deste curso (somados aos instrutores gerais). */
  cargosInstrutores: string[];
}

export interface CursosGeral {
  /** Instrutores de TODOS os cursos (não precisa repetir em cada curso). */
  cargosInstrutores: string[];
  /** Quem pode usar /remover curso. */
  cargosRemover: string[];
  /** Canal onde o bot registra turmas, conclusões e remoções. */
  logCanalId: string | null;
  /** Canal onde o bot posta a mensagem de cada turma (com Entrar / Sair). */
  canalTurmasId: string | null;
  /** Marca @everyone quando uma turma nova é postada. */
  mencionarTodos: boolean;
  /** Canal onde sai o certificado de quem conclui (null = certificado só no site). */
  canalCertificadosId: string | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

/**
 * inscricoes → andamento → encerrada (curso entregue a todos os participantes)
 * inscricoes/andamento → cancelada (ninguém recebe)
 */
export type StatusTurma = "inscricoes" | "andamento" | "encerrada" | "cancelada";

export interface Turma {
  id: string;
  cursoId: string;
  numero: number;
  status: StatusTurma;
  vagas: number | null;
  criadaEm: number;
  inicioEm: number | null;
  encerradaEm: number | null;
  abertaPor: { id: string; nome: string };
  /** Quem iniciou / finalizou / cancelou. */
  iniciadaPor: { id: string; nome: string } | null;
  encerradaPor: { id: string; nome: string } | null;
  /** Mensagem da turma no Discord (botões Entrar / Sair). */
  mensagem: { canalId: string; mensagemId: string } | null;
  /** Horário marcado para o curso (agendado pelo /curso ou pelo site). */
  agendadoPara: number | null;
  /** Texto livre mostrado na mensagem da turma (ex.: "1h", "Batalhão do BOPE", "1 fuzil, 150 munições"). */
  duracao: string | null;
  local: string | null;
  observacoes: string | null;
  /** Evento do servidor (Discord) que acompanha a turma: agendado → em andamento → encerrado. */
  evento: { id: string; status: StatusEvento } | null;
}

export type StatusEvento = "agendado" | "andamento" | "encerrado" | "cancelado";

/**
 * participando → (saiu | concluido) · concluido → removido (via /remover curso)
 * participando também vira "cancelado" se a turma for cancelada.
 */
export type StatusParticipante = "participando" | "saiu" | "concluido" | "removido" | "cancelado";

export interface Participante {
  id: string;
  cursoId: string;
  turmaId: string;
  userId: string;
  username: string;
  /** Apelido (set) ou nome no Discord no momento em que entrou. */
  nome: string;
  avatar: string | null;
  status: StatusParticipante;
  entrouEm: number;
  atualizadoEm: number;
  /** Cargo do curso entregue / retirado pelo bot. */
  cargoEntregue: boolean | null;
  concluidoEm: number | null;
  removido: { porId: string; porNome: string; em: number; cargoRetirado: boolean | null } | null;
  /** Emitido quando a turma é finalizada (ou depois, pelo site). */
  certificado: Certificado | null;
}

export interface Certificado {
  /** Número sequencial (contando todos os cursos). */
  numero: number;
  /** Código para conferência: SIGLA-TURMA-NÚMERO (ex.: CFSD-03-0012). */
  codigo: string;
  emitidoEm: number;
  /** Quem finalizou a turma. */
  instrutor: { id: string; nome: string };
  /** Nome no certificado (apelido do servidor na emissão). */
  nome: string;
  /** Foto usada: avatar do servidor da pessoa na emissão. */
  foto: string;
  /** Mensagem no canal de certificados (null = não publicado). */
  mensagem: { canalId: string; mensagemId: string } | null;
  /** Curso removido pelo /remover curso: o certificado fica marcado como revogado. */
  revogadoEm: number | null;
}

export interface CursoData {
  versao: 3;
  geral: CursosGeral;
  cursos: CursoConfig[];
  turmas: Turma[];
  participantes: Participante[];
}
