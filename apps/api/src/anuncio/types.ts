export interface AnuncioConfig {
  /** SÓ quem tem um destes cargos usa o botão "Realizar anúncio" (conferido a cada clique). */
  cargosPermitidos: string[];
  /** Texto do rodapé de TODOS os anúncios (fica ao lado da logo). */
  rodape: string;
  /** Mostra "Anunciado por @fulano" e a data no rodapé. */
  mostrarAutor: boolean;
  /** Cor da barra lateral do anúncio (0xRRGGBB). */
  cor: number;
  /** Canal onde o bot registra cada anúncio publicado (opcional). */
  logCanalId: string | null;
  /** Mensagem fixa com o botão "Realizar anúncio" publicada no Discord. */
  painel: { canalId: string; mensagemId: string } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface AnuncioRegistro {
  id: string;
  autor: { id: string; username: string; avatar: string | null };
  canalId: string;
  canalNome: string;
  mensagemId: string;
  titulo: string;
  /** Começo do texto, para o histórico. */
  trecho: string;
  caracteres: number;
  comImagem: boolean;
  em: number;
}

export interface AnuncioData {
  versao: 1;
  config: AnuncioConfig;
  registros: AnuncioRegistro[];
}
