/**
 * Módulos da dashboard que podem ser liberados para a equipe. O id é o mesmo prefixo da rota da API
 * (/api/<id>/…) — é assim que o servidor sabe de qual módulo veio cada requisição.
 */
export const MODULOS = [
  { id: "set", nome: "Pedir Set", grupo: "Efetivo" },
  { id: "ponto", nome: "Bate-ponto", grupo: "Efetivo" },
  { id: "horas", nome: "Sistema de Horas", grupo: "Efetivo" },
  { id: "hierarquia", nome: "Hierarquia", grupo: "Efetivo" },
  { id: "assuncao", nome: "Assunção de Serviço", grupo: "Efetivo" },
  { id: "inteligencia", nome: "Assunção Inteligência", grupo: "Efetivo" },
  { id: "promocao", nome: "Promoções", grupo: "Efetivo" },
  { id: "adicionar-cargo", nome: "Adicionar Cargo", grupo: "Efetivo" },
  { id: "corregedoria", nome: "Corregedoria", grupo: "Efetivo" },
  { id: "disciplina", nome: "Disciplina", grupo: "Efetivo" },
  { id: "doesp", nome: "DOESP", grupo: "Efetivo" },
  { id: "boletim", nome: "Boletim Interno", grupo: "Efetivo" },
  { id: "ocorrencia", nome: "Ocorrência", grupo: "Efetivo" },
  { id: "comunicado", nome: "Comunicados de Operação", grupo: "Efetivo" },
  { id: "arsenal", nome: "Retirada de Baú", grupo: "Efetivo" },
  { id: "curso", nome: "Cursos e Cadastro de cursos", grupo: "Formação" },
  { id: "anuncio", nome: "Anúncio", grupo: "Servidor" },
  { id: "entrada-saida", nome: "Entrada e Saída", grupo: "Servidor" },
  { id: "branding", nome: "Aparência", grupo: "Sistema" },
] as const;

export type ModuloId = (typeof MODULOS)[number]["id"];
export const IDS_MODULOS = new Set<string>(MODULOS.map((m) => m.id));
