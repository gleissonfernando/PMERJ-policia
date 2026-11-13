import { KeyRound, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { DiscordLoginButton } from '@/components/Discord'
import { PlayerTrilha, useTrilha } from '@/components/entrar/Trilha'
import { Alert } from '@/components/ui'
import { useLogoUrl } from '@/lib/branding'
import { cn } from '@/lib/cn'
import { loginErrorMessage } from '@/lib/loginErrors'
import { useSession } from '@/lib/useSession'

type Fase = 'intro' | 'saindo' | 'cena'

/**
 * Login do painel militar — tela cinematográfica:
 *   intro  : vídeo desfocado + brasão "Clique para acessar" (o clique libera a música)
 *   cena   : vídeo nítido em tela cheia, PMERJ em destaque e o login pelo Discord
 * Voltando de um erro de login, vai direto para a cena (com o aviso).
 */
export function Entrar() {
  const [params] = useSearchParams()
  const session = useSession()
  const error = loginErrorMessage(params.get('erro'))
  const trilha = useTrilha()
  // Mesmo brasão do sistema inteiro (o padrão, ou o enviado em Painel → Aparência).
  const logo = useLogoUrl()
  const [fase, setFase] = useState<Fase>(error ? 'cena' : 'intro')
  const video = useRef<HTMLVideoElement>(null)

  // O vídeo de fundo SEMPRE roda (mesmo com "menos movimento" no sistema: ele é a própria tela).
  // Sem som garantido antes do play — é o que o navegador exige para tocar sozinho.
  const rodarVideo = useCallback(() => {
    const v = video.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    v.setAttribute('muted', '')
    if (v.paused) void v.play().catch(() => {})
  }, [])

  useEffect(() => {
    rodarVideo()
    const v = video.current
    // Pronto para tocar, aba voltou a ficar visível ou o navegador pausou: tenta de novo.
    const aoVoltar = () => document.visibilityState === 'visible' && rodarVideo()
    v?.addEventListener('canplay', rodarVideo)
    v?.addEventListener('pause', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      v?.removeEventListener('canplay', rodarVideo)
      v?.removeEventListener('pause', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [rodarVideo])

  if (session.status === 'authenticated' && session.me.context === 'painel') {
    return <Navigate to="/painel" replace />
  }

  function entrar() {
    rodarVideo() // no clique o navegador sempre deixa tocar
    trilha.tocar() // precisa ser no próprio clique
    setFase('saindo')
    window.setTimeout(() => setFase('cena'), 700)
  }

  return (
    <div className={cn('fixed inset-0 overflow-hidden bg-black text-white', fase === 'cena' ? 'cine-cena' : 'cine-intro')}>
      {/* Palco: vídeo de fundo, véu e granulado */}
      <div aria-hidden="true" className="absolute inset-0">
        <video ref={video} className="cine-video" src="/video/login-bg.mp4" poster="/video/login-poster.jpg" muted loop autoPlay playsInline preload="auto" />
        <div className="cine-escuro" />
        <div className="cine-veu" />
        <div className="cine-ruido pointer-events-none" />
      </div>

      {/* ---------- INTRO ---------- */}
      {fase !== 'cena' && (
        <div className={cn('absolute inset-0 grid place-items-center px-6', fase === 'saindo' && 'cine-sai')}>
          <button type="button" onClick={entrar} className="group grid justify-items-center gap-6 rounded-3xl p-4 outline-none" aria-label="Clique no brasão para acessar o painel">
            <img
              src={logo}
              alt="Brasão da Polícia Militar do Estado do Rio de Janeiro"
              draggable={false}
              className="cine-emblema h-[clamp(220px,46vh,420px)] w-auto select-none object-contain"
            />
            <span className="grid justify-items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.42em] text-white/85 transition group-hover:text-white">Clique para acessar</span>
              <span className="h-px w-16 bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent transition-all duration-500 group-hover:w-28" />
            </span>
          </button>
          <span className="absolute bottom-8 text-[10px] font-bold uppercase tracking-[0.3em] text-white/35">Polícia Militar do Estado do Rio de Janeiro</span>
        </div>
      )}

      {/* ---------- CENA DE LOGIN ---------- */}
      {fase === 'cena' && (
        <main className="relative flex h-full flex-col">
          <header className="cine-surge flex items-center justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8">
            <Link to="/acesso" className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/55 px-3.5 py-2 text-xs font-bold text-white/75 transition hover:border-white/25 hover:text-white">
              <Users className="size-3.5" /> Sou civil
            </Link>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/60">
              <span className="size-1.5 animate-siren rounded-full bg-[var(--color-primary)]" /> Acesso restrito
            </span>
          </header>

          <section className="flex flex-1 flex-col items-center justify-center px-5 text-center">
            <img src={logo} alt="" className="cine-surge mb-6 h-20 w-auto object-contain drop-shadow-[0_10px_30px_rgb(0_0_0/0.7)] sm:h-24" style={{ animationDelay: '80ms' }} />
            <h1 className="cine-titulo cine-surge text-[clamp(4.5rem,17vw,12.5rem)]" data-texto="PMERJ" style={{ animationDelay: '160ms' }}>
              PMERJ
            </h1>
            <p className="cine-surge mt-5 text-[11px] font-bold uppercase tracking-[0.34em] text-white/75 sm:text-[13px]" style={{ animationDelay: '280ms' }}>
              Polícia Militar do Estado do Rio de Janeiro
            </p>
            <p className="cine-surge mt-2 text-sm text-white/50" style={{ animationDelay: '360ms' }}>
              Painel militar · serviço, honra e disciplina
            </p>

            <div className="cine-surge mt-10 grid w-full max-w-[400px] gap-4" style={{ animationDelay: '480ms' }}>
              {error && <Alert>{error}</Alert>}
              <DiscordLoginButton context="painel" title="Entrar com Discord" hint="Só membros do servidor oficial" className="bg-black/65" />
              <p className="flex items-center justify-center gap-2 text-[11px] text-white/45">
                <KeyRound className="size-3.5" /> Nenhuma senha é digitada aqui
                <span aria-hidden="true">·</span>
                <ShieldCheck className="size-3.5" /> OAuth2 oficial
              </p>
            </div>
          </section>

          <footer className="cine-surge flex flex-wrap items-end justify-between gap-4 px-5 pb-5 sm:px-10 sm:pb-8" style={{ animationDelay: '620ms' }}>
            <PlayerTrilha trilha={trilha} />
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">PMERJ · Painel Militar</span>
          </footer>
        </main>
      )}
    </div>
  )
}
