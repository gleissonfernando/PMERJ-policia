import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

export function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-5 text-center">
      <div className="animate-rise">
        <span className="kicker">Erro 404</span>
        <h1 className="display mt-3 text-5xl">Área não encontrada</h1>
        <p className="mt-3 text-muted">O endereço acessado não existe ou foi removido.</p>
        <Link
          to="/"
          className="mt-7 inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-bold text-on-primary transition hover:bg-primary-2"
        >
          <ArrowLeft className="size-4" /> Voltar ao início
        </Link>
      </div>
    </main>
  )
}
