export type TipoAnuncio = "entrada" | "saida";

export interface AnuncioConfig {
  ativo: boolean;
  canalId: string | null;
  /** Título do anúncio. Tokens: {nome} {usuario} {servidor} {total} */
  titulo: string;
  /** Texto do anúncio. Tokens: {membro} (menção) {nome} {usuario} {servidor} {total} */
  mensagem: string;
  /** Cor da barra lateral (0xRRGGBB). */
  cor: number;
  /** Mostra idade da conta, nº do membro e tempo no servidor. */
  detalhes: boolean;
  /** Só na entrada: notifica a pessoa (menção que pinga). */
  mencionar: boolean;
}

export interface EntradaSaidaConfig {
  entrada: AnuncioConfig;
  saida: AnuncioConfig;
  /** Não anuncia bots. */
  ignorarBots: boolean;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface EventoMembro {
  id: string;
  tipo: TipoAnuncio;
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
  em: number;
  totalMembros: number;
  contaCriadaEm: number;
  entrouEm: number | null;
  /** O anúncio chegou ao canal? */
  anunciado: boolean;
}

export interface EntradaSaidaData {
  versao: 1;
  config: EntradaSaidaConfig;
  eventos: EventoMembro[];
}
