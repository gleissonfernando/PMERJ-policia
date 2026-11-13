/**
 * Comandos cuja VISIBILIDADE no Discord (quais cargos veem o comando) pode ser aplicada pelo painel.
 *
 * O Discord não deixa o bot fazer isso: exige o token OAuth de um admin do servidor com o escopo
 * applications.commands.permissions.update. Por isso o admin clica em "Aplicar no Discord", autoriza
 * na tela do Discord, e o callback do login (auth/discord.ts) usa o token UMA vez e o revoga.
 * Cada módulo se registra aqui (evita o login depender de todos os módulos).
 */

export interface AlvoVisibilidade {
  /** Nome do comando de barra. */
  comando: string;
  /** Cargos que devem ver o comando agora (lidos da configuração salva). */
  cargos: () => string[];
  /** Guarda quando/por quem foi aplicado (para o painel mostrar se está em dia). */
  aoAplicar: (cargos: string[], por: { id: string; nome: string }) => Promise<void>;
  /** Página do painel para onde voltar (recebe ?visibilidade=ok|<erro>). */
  volta: string;
}

const alvos = new Map<string, AlvoVisibilidade>();

export const registrarVisibilidade = (chave: string, alvo: AlvoVisibilidade) => void alvos.set(chave, alvo);
export const alvoVisibilidade = (chave: string) => alvos.get(chave);

/** Endereço de volta com o resultado (?visibilidade=ok|<erro>). */
export const voltaVisibilidade = (volta: string, resultado: string) => `${volta}${volta.includes("?") ? "&" : "?"}visibilidade=${encodeURIComponent(resultado)}`;
