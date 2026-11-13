/** Texto de um campo do formulário no Discord (Label do modal). */
export interface RotuloCampo {
  /** Título do campo (máx. 45 no Discord). */
  label: string;
  /** Linha de ajuda embaixo do título (máx. 100). */
  descricao: string;
}

export type CampoId = "setor" | "viatura" | "comandante" | "motopol" | "demais";

/**
 * Uma "assunção de serviço" (ex.: Guarnição). Cada uma tem o próprio painel no Discord,
 * o próprio canal de resultado e os próprios cargos.
 *
 * Formulário (o Discord aceita no máximo 5 campos por modal):
 *   Setor · Viatura/Prefixo · Comandante · Motopol · Demais integrantes
 * A quantidade de policiais é contada automaticamente (comandante + motopol + demais).
 */
export interface Assuncao {
  /** Curto e estável: vai no custom_id dos botões (assuncao:abrir:<id>). */
  id: string;
  /** Nome curto, vira o título do formulário. Ex.: "Guarnição". */
  nome: string;
  emoji: string;
  /** Texto do painel no Discord. */
  descricao: string;
  cor: number;
  /** Desligada: o botão do painel avisa que está fechada. */
  ativa: boolean;
  /** SÓ quem tem um destes cargos abre o formulário (conferido a cada clique). */
  cargosPermitidos: string[];
  /** Se tiver algum, o COMANDANTE escolhido precisa ter um destes cargos (ex.: Sargentos e Oficiais). */
  cargosComandante: string[];
  /** Onde o resultado é publicado. */
  canalResultadoId: string | null;
  /** Lista de setores: vazia = campo de texto livre; com itens = menu de escolha. */
  setores: string[];
  /** Máximo de "demais integrantes" (03, 04…). 0 = guarnição só de comandante e motopol. */
  maxDemais: number;
  /** Notifica os policiais citados no resultado. */
  mencionar: boolean;
  campos: Record<CampoId, RotuloCampo>;
  /** Mensagem fixa com o botão publicada no Discord. */
  painel: { canalId: string; mensagemId: string } | null;
}

export interface PolicialRegistro {
  id: string;
  nome: string;
}

export interface AssuncaoRegistro {
  id: string;
  assuncaoId: string;
  assuncaoNome: string;
  autor: { id: string; username: string; avatar: string | null };
  setor: string;
  viatura: string;
  comandante: PolicialRegistro;
  motopol: PolicialRegistro;
  demais: PolicialRegistro[];
  canalId: string;
  mensagemId: string;
  em: number;
}

export interface AssuncaoData {
  versao: 1;
  assuncoes: Assuncao[];
  registros: AssuncaoRegistro[];
  atualizadoEm: number;
  atualizadoPor: string | null;
}
