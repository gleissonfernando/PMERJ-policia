import type { SetConfig } from "./types.js";

/**
 * Configuração inicial: hierarquia oficial da PMERJ já cadastrada.
 * Órgão vem cadastrado, mas DESLIGADO — o comando ativa nas Configurações se quiser.
 */
export const DEFAULT_SET_CONFIG: SetConfig = {
  campos: { orgao: false },
  formato: "{prefixo} {nome} | {id}",
  alterarApelido: true,
  patentes: [
    { id: "al-sd", nome: "Aluno Soldado", prefixo: "AL SD" },
    { id: "sd", nome: "Soldado", prefixo: "SD" },
    { id: "cb", nome: "Cabo", prefixo: "CB" },
    { id: "3sgt", nome: "3º Sargento", prefixo: "3º SGT" },
    { id: "2sgt", nome: "2º Sargento", prefixo: "2º SGT" },
    { id: "1sgt", nome: "1º Sargento", prefixo: "1º SGT" },
    { id: "st", nome: "Subtenente", prefixo: "ST" },
    { id: "cad", nome: "Cadete", prefixo: "CAD" },
    { id: "asp", nome: "Aspirante a Oficial", prefixo: "ASP" },
    { id: "2ten", nome: "2º Tenente", prefixo: "2º TEN" },
    { id: "1ten", nome: "1º Tenente", prefixo: "1º TEN" },
    { id: "cap", nome: "Capitão", prefixo: "CAP" },
    { id: "maj", nome: "Major", prefixo: "MAJ" },
    { id: "tcel", nome: "Tenente-Coronel", prefixo: "TEN CEL" },
    { id: "cel", nome: "Coronel", prefixo: "CEL" },
  ],
  orgaos: [
    { id: "bpm", nome: "Batalhão de Polícia Militar", sigla: "BPM" },
    { id: "bope", nome: "Batalhão da Polícia Militar do Estado do Rio de Janeiro", sigla: "PMERJ" },
    { id: "bpchq", nome: "Batalhão de Polícia de Choque", sigla: "BPChq" },
    { id: "bac", nome: "Batalhão de Ações com Cães", sigla: "BAC" },
    { id: "bprv", nome: "Batalhão de Polícia Rodoviária", sigla: "BPRv" },
    { id: "gam", nome: "Grupamento Aeromóvel", sigla: "GAM" },
  ],
  modo: "automatico",
  cargosAprovadores: [],
  aprovacaoCategoriaId: null,
  cargosAoAprovar: [],
  expulsarAoReprovar: true,
  logCanalId: null,
  painel: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};
