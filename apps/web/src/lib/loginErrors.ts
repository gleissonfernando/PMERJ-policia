/** Mensagens para os códigos de erro que a API devolve em ?erro=. Códigos fora da lista são ignorados. */
const MESSAGES: Record<string, string> = {
  cancelado: 'Você cancelou a autorização no Discord.',
  expirado: 'O login expirou. Tente novamente.',
  invalido: 'Não foi possível validar o login. Tente novamente.',
  nao_membro: 'Sua conta do Discord não faz parte do servidor oficial da PMERJ.',
  sem_acesso: 'Sua conta ainda não foi liberada para o painel. Peça a um administrador para adicioná-la à Equipe do painel.',
  falha_discord: 'O Discord não respondeu como esperado. Tente novamente em instantes.',
}

export function loginErrorMessage(code: string | null): string | null {
  return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : null
}
