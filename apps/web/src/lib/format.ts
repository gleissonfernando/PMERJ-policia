const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const relativo = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export const fmtDataHora = (t: number) => dataHora.format(t)
export const fmtHora = (t: number) => hora.format(t)

/** "há 5 minutos", "ontem", "há 3 anos"… */
export function fmtRelativo(t: number, agora = Date.now()): string {
  const s = Math.round((t - agora) / 1000)
  const abs = Math.abs(s)
  if (abs < 60) return relativo.format(s, 'second')
  if (abs < 3600) return relativo.format(Math.round(s / 60), 'minute')
  if (abs < 86_400) return relativo.format(Math.round(s / 3600), 'hour')
  if (abs < 2_592_000) return relativo.format(Math.round(s / 86_400), 'day')
  if (abs < 31_536_000) return relativo.format(Math.round(s / 2_592_000), 'month')
  return relativo.format(Math.round(s / 31_536_000), 'year')
}
