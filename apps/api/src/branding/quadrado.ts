import { crc32, deflateSync, inflateSync } from "node:zlib";

/**
 * Coloca a imagem no centro de um quadrado transparente.
 *
 * O Discord SEMPRE recorta a miniatura (Thumbnail) de uma Section em quadrado: um brasão
 * alto perde o topo e a base. Com margens transparentes nas laterais, ele aparece inteiro.
 *
 * Só PNG (8 bits, sem entrelaçamento — o formato comum). Qualquer outro caso devolve null
 * e quem chama usa a imagem original. Sem dependências: só zlib do Node.
 */

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Evita "bombas" de descompressão: logos maiores que isso ficam como estão. */
const LADO_MAX = 2048;
/** Bytes por pixel de cada tipo de cor PNG com 8 bits. */
const CANAIS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** PNG → pixels RGBA. */
function decodificar(png: Buffer): { w: number; h: number; rgba: Buffer } | null {
  if (png.length < 33 || !png.subarray(0, 8).equals(ASSINATURA)) return null;
  let w = 0;
  let h = 0;
  let cor = -1;
  let paleta: Buffer | null = null;
  let transp: Buffer | null = null;
  const dados: Buffer[] = [];

  for (let pos = 8; pos + 8 <= png.length; ) {
    const tam = png.readUInt32BE(pos);
    const tipo = png.toString("ascii", pos + 4, pos + 8);
    const corpo = png.subarray(pos + 8, pos + 8 + tam);
    if (corpo.length !== tam) return null;
    if (tipo === "IHDR") {
      w = corpo.readUInt32BE(0);
      h = corpo.readUInt32BE(4);
      cor = corpo[9]!;
      if (corpo[8] !== 8 || corpo[12] !== 0) return null; // só 8 bits, sem entrelaçamento
    } else if (tipo === "PLTE") paleta = corpo;
    else if (tipo === "tRNS") transp = corpo;
    else if (tipo === "IDAT") dados.push(corpo);
    else if (tipo === "IEND") break;
    pos += 12 + tam;
  }

  const bpp = CANAIS[cor];
  if (!bpp || !w || !h || w > LADO_MAX || h > LADO_MAX || (cor === 3 && !paleta)) return null;

  const linha = w * bpp;
  let cru: Buffer;
  try {
    cru = inflateSync(Buffer.concat(dados), { maxOutputLength: (linha + 1) * h });
  } catch {
    return null;
  }
  if (cru.length !== (linha + 1) * h) return null;

  // Desfaz os filtros de cada linha.
  const px = Buffer.alloc(linha * h);
  for (let y = 0; y < h; y++) {
    const filtro = cru[y * (linha + 1)]!;
    const src = y * (linha + 1) + 1;
    const dst = y * linha;
    for (let x = 0; x < linha; x++) {
      const v = cru[src + x]!;
      const a = x >= bpp ? px[dst + x - bpp]! : 0;
      const b = y > 0 ? px[dst - linha + x]! : 0;
      const c = x >= bpp && y > 0 ? px[dst - linha + x - bpp]! : 0;
      const pred = filtro === 0 ? 0 : filtro === 1 ? a : filtro === 2 ? b : filtro === 3 ? (a + b) >> 1 : filtro === 4 ? paeth(a, b, c) : -1;
      if (pred < 0) return null;
      px[dst + x] = (v + pred) & 0xff;
    }
  }

  // Converte para RGBA.
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const s = i * bpp;
    if (cor === 6) px.copy(rgba, o, s, s + 4);
    else if (cor === 2) {
      px.copy(rgba, o, s, s + 3);
      rgba[o + 3] = 255;
    } else if (cor === 0 || cor === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]!;
      rgba[o + 3] = cor === 4 ? px[s + 1]! : 255;
    } else {
      const idx = px[s]!;
      rgba[o] = paleta![idx * 3] ?? 0;
      rgba[o + 1] = paleta![idx * 3 + 1] ?? 0;
      rgba[o + 2] = paleta![idx * 3 + 2] ?? 0;
      rgba[o + 3] = transp && idx < transp.length ? transp[idx]! : 255;
    }
  }
  return { w, h, rgba };
}

function bloco(tipo: string, corpo: Buffer): Buffer {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(corpo.length);
  const tipoBuf = Buffer.from(tipo, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, corpo])) >>> 0);
  return Buffer.concat([tam, tipoBuf, corpo, crc]);
}

/** PNG quadrado com a imagem centralizada (ou null se não der para processar). */
export function centralizarEmQuadrado(png: Buffer): Buffer | null {
  const img = decodificar(png);
  if (!img) return null;
  const { w, h, rgba } = img;
  if (w === h) return png;

  // Pequena folga em volta para a logo não encostar nas bordas arredondadas do Discord.
  const lado = Math.ceil(Math.max(w, h) * 1.06);
  const ox = Math.floor((lado - w) / 2);
  const oy = Math.floor((lado - h) / 2);

  const linha = lado * 4;
  const cru = Buffer.alloc((linha + 1) * lado); // filtro 0 em todas as linhas, fundo transparente
  for (let y = 0; y < h; y++) {
    rgba.copy(cru, (y + oy) * (linha + 1) + 1 + ox * 4, y * w * 4, (y + 1) * w * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([ASSINATURA, bloco("IHDR", ihdr), bloco("IDAT", deflateSync(cru, { level: 9 })), bloco("IEND", Buffer.alloc(0))]);
}
