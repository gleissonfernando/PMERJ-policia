import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Trilha sonora da tela de login. As faixas ficam em apps/web/public/audio/ e a lista em
 * public/audio/playlist.json: [{ "arquivo": "faixa.mp3", "titulo": "Nome", "artista": "Quem" }].
 * O navegador só deixa tocar som depois de um clique — por isso a música começa no "Clique para acessar".
 */

export interface Faixa {
  arquivo: string
  titulo: string
  artista?: string
}

const CHAVE_VOLUME = 'pmerj:entrar:volume'
const lerVolume = () => {
  try {
    const v = Number(localStorage.getItem(CHAVE_VOLUME))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.45
  } catch {
    return 0.45
  }
}

export function useTrilha() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [atual, setAtual] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [volume, setVolumeState] = useState(lerVolume)
  const [mudo, setMudo] = useState(false)

  // Lista de faixas (arquivo estático; sem lista ou vazia = sem player).
  useEffect(() => {
    let vivo = true
    fetch('/audio/playlist.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: unknown) => {
        if (!vivo || !Array.isArray(lista)) return
        const validas = lista.filter((f): f is Faixa => Boolean(f && typeof f.arquivo === 'string' && /^[\w .()-]+\.(mp3|ogg|m4a|webm|wav)$/i.test(f.arquivo) && typeof f.titulo === 'string'))
        setFaixas(validas.slice(0, 20))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  // Um único <audio>; a fonte muda conforme a faixa.
  useEffect(() => {
    const a = new Audio()
    a.preload = 'metadata'
    audio.current = a
    const onPlay = () => setTocando(true)
    const onPause = () => setTocando(false)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    return () => {
      a.pause()
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      audio.current = null
    }
  }, [])

  const indiceRef = useRef(0)
  useEffect(() => {
    indiceRef.current = atual
  }, [atual])
  const src = (f: Faixa) => `/audio/${encodeURIComponent(f.arquivo)}`

  /** Única forma de trocar de faixa: muda a fonte e (se pedido) já toca. */
  const irPara = useCallback(
    (i: number, tocarJa: boolean) => {
      const a = audio.current
      const f = faixas[i]
      if (!a || !f) return
      setAtual(i)
      a.src = src(f)
      if (tocarJa) void a.play().catch(() => {})
    },
    [faixas],
  )

  // Acabou a faixa → próxima (volta ao começo da lista).
  useEffect(() => {
    const a = audio.current
    if (!a || !faixas.length) return
    const fimDaFaixa = () => irPara((indiceRef.current + 1) % faixas.length, true)
    a.addEventListener('ended', fimDaFaixa)
    return () => a.removeEventListener('ended', fimDaFaixa)
  }, [faixas.length, irPara])

  useEffect(() => {
    if (audio.current) audio.current.volume = mudo ? 0 : volume
  }, [volume, mudo])

  /** Chamar DENTRO do clique (o navegador exige um gesto do usuário para tocar som). */
  const tocar = useCallback(() => {
    const a = audio.current
    const f = faixas[atual]
    if (!a || !f) return
    if (!a.src) a.src = src(f)
    a.volume = mudo ? 0 : volume
    void a.play().catch(() => {})
  }, [faixas, atual, volume, mudo])

  const pausar = useCallback(() => audio.current?.pause(), [])
  const pular = useCallback(
    (passo: 1 | -1) => {
      if (!faixas.length) return
      irPara((atual + passo + faixas.length) % faixas.length, Boolean(audio.current && !audio.current.paused))
    },
    [faixas.length, atual, irPara],
  )
  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    setMudo(v === 0)
    try {
      localStorage.setItem(CHAVE_VOLUME, String(v))
    } catch {
      /* armazenamento bloqueado: só não lembra o volume */
    }
  }, [])

  return { faixas, atual: faixas[atual] ?? null, indice: atual, tocando, volume, mudo, tocar, pausar, pular, setVolume, alternarMudo: () => setMudo((m) => !m) }
}

export type Trilha = ReturnType<typeof useTrilha>

/** Player discreto no canto da tela. */
export function PlayerTrilha({ trilha, className }: { trilha: Trilha; className?: string }) {
  if (!trilha.faixas.length || !trilha.atual) return null
  const { atual, tocando, mudo, volume } = trilha
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-white/10 bg-black/70 py-2 pl-3 pr-2 text-white shadow-[0_20px_50px_rgb(0_0_0/0.5)]',
        className,
      )}
      role="region"
      aria-label="Trilha sonora"
    >
      <span className="cine-eq flex h-6 w-5 items-end gap-[2px]" data-tocando={tocando} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <div className="min-w-0 max-w-[11rem] leading-tight sm:max-w-[14rem]">
        <div className="truncate text-[13px] font-bold" title={atual.titulo}>
          {atual.titulo}
        </div>
        <div className="truncate text-[11px] text-white/55">
          {atual.artista ? `${atual.artista} · ` : ''}faixa {trilha.indice + 1}/{trilha.faixas.length}
        </div>
      </div>
      <div className="flex items-center">
        {trilha.faixas.length > 1 && (
          <BotaoPlayer rotulo="Faixa anterior" onClick={() => trilha.pular(-1)}>
            <SkipBack className="size-4" />
          </BotaoPlayer>
        )}
        <BotaoPlayer rotulo={tocando ? 'Pausar música' : 'Tocar música'} onClick={tocando ? trilha.pausar : trilha.tocar} destaque>
          {tocando ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </BotaoPlayer>
        {trilha.faixas.length > 1 && (
          <BotaoPlayer rotulo="Próxima faixa" onClick={() => trilha.pular(1)}>
            <SkipForward className="size-4" />
          </BotaoPlayer>
        )}
        <BotaoPlayer rotulo={mudo ? 'Ativar som' : 'Silenciar'} onClick={trilha.alternarMudo}>
          {mudo ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </BotaoPlayer>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mudo ? 0 : volume}
          onChange={(e) => trilha.setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="ml-1 hidden w-20 accent-[var(--color-primary)] sm:block"
        />
      </div>
    </div>
  )
}

function BotaoPlayer({ rotulo, onClick, destaque, children }: { rotulo: string; onClick: () => void; destaque?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'grid size-9 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        destaque ? 'bg-white text-black hover:bg-white/85' : 'text-white/75 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
