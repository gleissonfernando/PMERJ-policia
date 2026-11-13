/**
 * Ponto de entrada: primeiro o armazenamento (MongoDB da Discloud ou arquivos locais),
 * depois a API e o bot. Os módulos leem os dados quando são importados, então o banco
 * precisa estar carregado antes do import.
 */
import { prepararArmazenamento } from "./lib/armazenamento.js";

await prepararArmazenamento();
await import("./index.js");
