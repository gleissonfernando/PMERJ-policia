export interface RotuloCampo {
  /** Título do campo (máx. 45 no Discord). */
  label: string;
  /** Ajuda embaixo do título (máx. 100). */
  descricao: string;
}

export type CampoId = "quantidade" | "policiais" | "objeto" | "fotos" | "link";

/**
 * Assunção de Serviço Inteligência — formulário (5 campos, o máximo do Discord):
 *   Quantidade de policiais · Policiais · Objeto da investigação · Fotos (upload) · Link
 * A foto pode vir por upload OU por link.
 */
export interface InteligenciaConfig {
  nome: string;
  emoji: string;
  /** Texto do painel no Discord. */
  descricao: string;
  cor: number;
  ativa: boolean;
  /** SÓ quem tem um destes cargos abre o formulário (conferido no clique e no envio). */
  cargosPermitidos: string[];
  /** Onde o resultado é publicado. */
  canalResultadoId: string | null;
  /** Lista de comunidades/organizações: vazia = texto livre; com itens = menu. */
  objetos: string[];
  maxPoliciais: number;
  /** Exige pelo menos uma foto (upload ou link). */
  exigirFoto: boolean;
  mencionar: boolean;
  campos: Record<CampoId, RotuloCampo>;
  painel: { canalId: string; mensagemId: string } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface PolicialRegistro {
  id: string;
  nome: string;
}

export interface InteligenciaRegistro {
  id: string;
  autor: { id: string; username: string; avatar: string | null };
  objeto: string;
  policiais: PolicialRegistro[];
  fotosEnviadas: number;
  links: string[];
  canalId: string;
  mensagemId: string;
  em: number;
}

export interface InteligenciaData {
  versao: 1;
  config: InteligenciaConfig;
  registros: InteligenciaRegistro[];
}
