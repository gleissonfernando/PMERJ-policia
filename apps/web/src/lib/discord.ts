/** Tipos compartilhados das telas que falam com o bot. Espelham a API. */

export type TipoCanal = 'texto' | 'anuncios' | 'voz' | 'palco'

export interface CanalTexto {
  id: string
  nome: string
  tipo: TipoCanal
  categoria: string | null
  /** O bot pode ver o canal e enviar mensagens nele. */
  podeEnviar: boolean
}

export type GatewayStatus =
  | { estado: 'desligado' }
  | { estado: 'conectando' }
  | { estado: 'online'; bot: string }
  | { estado: 'erro'; motivo: string }

export interface Cargo {
  id: string
  nome: string
  /** Cor do cargo (0 = sem cor). */
  cor: number
}
