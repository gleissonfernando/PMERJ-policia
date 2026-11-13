export interface Patente {
  id: string;
  nome: string;
  prefixo: string;
  /** Cargo do Discord ligado à patente (entregue na aprovação; os de outras patentes são retirados). */
  cargoId?: string | null;
}

export interface Orgao {
  id: string;
  nome: string;
  sigla: string;
}

export type ModoSet = "automatico" | "aprovacao";

export interface SetConfig {
  /** Campo opcional do formulário. Patente, nome e ID são sempre obrigatórios. */
  campos: { orgao: boolean };
  /** Modelo do apelido. Tokens: {prefixo} {nome} {id} {orgao} */
  formato: string;
  /** Se o bot deve trocar o apelido no Discord quando o set é aplicado. */
  alterarApelido: boolean;
  /** Ordem da lista = ordem hierárquica (menor → maior). Máx. 25 (limite do menu do Discord). */
  patentes: Patente[];
  orgaos: Orgao[];
  /** automatico = aplica na hora · aprovacao = vira pedido que alguém aprova ou reprova. */
  modo: ModoSet;
  /** SÓ quem tem um destes cargos aprova ou reprova (e só eles veem o canal temporário do pedido). */
  cargosAprovadores: string[];
  /** Categoria onde o bot cria o canal temporário de cada pedido (null = sem categoria). */
  aprovacaoCategoriaId: string | null;
  /** Cargos entregues a todo set aprovado (ex.: "Policial"), além do cargo da patente. */
  cargosAoAprovar: string[];
  /** Reprovado = expulso do servidor (depois de receber a DM com o motivo). */
  expulsarAoReprovar: boolean;
  /** Canal onde o bot registra cada set aplicado/reprovado (opcional). */
  logCanalId: string | null;
  /** Mensagem do painel "Pedir Set" publicada no Discord. */
  painel: { canalId: string; mensagemId: string } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export type StatusApelido = "aplicado" | "falhou" | "desligado";
/** Resultado de uma ação do bot no Discord (cargos, expulsão). */
export type StatusAcao = "feito" | "falhou" | "nao_se_aplica";
export type OrigemSet = "painel" | "discord";
/** pendente = aguardando aprovação · aprovado = set valendo · reprovado/cancelado = encerrado. */
export type StatusPedido = "pendente" | "aprovado" | "reprovado" | "cancelado";

/** Pedido de set. Guarda uma "foto" de patente/órgão para o histórico não mudar com a configuração. */
export interface SetRegistro {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  nome: string;
  gameId: string;
  patente: Patente;
  orgao: Orgao | null;
  apelido: string;
  status: StatusPedido;
  /** Só faz sentido quando aprovado. */
  statusApelido: StatusApelido;
  /** Cargos entregues na aprovação. */
  statusCargos?: StatusAcao;
  /** Expulsão na reprovação. */
  statusExpulsao?: StatusAcao;
  origem: OrigemSet;
  /** Quando foi pedido (ou atualizado, se ainda pendente). */
  em: number;
  /** Quem decidiu (null = aprovação automática). */
  decididoPor: { id: string; username: string } | null;
  decididoEm: number | null;
  motivo: string | null;
  /** Canal temporário do pedido e a mensagem com os botões (apagado depois da decisão). */
  mensagem: { canalId: string; mensagemId: string } | null;
}

export interface SetData {
  versao: 1;
  config: SetConfig;
  registros: SetRegistro[];
}
