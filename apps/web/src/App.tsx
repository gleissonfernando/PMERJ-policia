import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { Background } from '@/components/Background'
import { PainelLayout } from '@/components/PainelLayout'
import { Footer } from '@/components/ui'
import { Cidadao } from '@/pages/Cidadao'
import { EntradaSaida } from '@/pages/EntradaSaida'
import { Entrar } from '@/pages/Entrar'
import { Gateway } from '@/pages/Gateway'
import { NotFound } from '@/pages/NotFound'
import { Painel } from '@/pages/Painel'
import { PedirSet } from '@/pages/PedirSet'
import { Aparencia } from '@/pages/Aparencia'
import { Anuncio } from '@/pages/Anuncio'
import { Assuncao } from '@/pages/Assuncao'
import { Inteligencia } from '@/pages/Inteligencia'
import { Promocao } from '@/pages/Promocao'
import { AdicionarCargo } from '@/pages/AdicionarCargo'
import { Horas } from '@/pages/Horas'
import { Equipe } from '@/pages/Equipe'
import { Corregedoria } from '@/pages/Corregedoria'
import { Disciplina } from '@/pages/Disciplina'
import { Ponto } from '@/pages/Ponto'
import { Doesp } from '@/pages/Doesp'
import { Boletim } from '@/pages/Boletim'
import { Ocorrencia } from '@/pages/Ocorrencia'
import { Hierarquia } from '@/pages/Hierarquia'
import { Comunicado } from '@/pages/Comunicado'
import { Arsenal } from '@/pages/Arsenal'
import { Transcript } from '@/pages/Transcript'
import { CadastroCursosPage } from '@/pages/CadastroCursosPage'
import { Cursos } from '@/pages/Cursos'

export default function App() {
  return (
    <BrowserRouter>
      <FundoPublico />
      <div className="relative flex min-h-dvh flex-col">
        <Routes>
          <Route path="/" element={<Entrar />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/acesso" element={<Gateway />} />
          <Route path="/painel" element={<PainelLayout />}>
            <Route index element={<Painel />} />
            <Route path="set" element={<PedirSet />} />
            <Route path="promocoes" element={<Promocao />} />
            <Route path="adicionar-cargo" element={<AdicionarCargo />} />
            <Route path="corregedoria" element={<Corregedoria />} />
            <Route path="disciplina" element={<Disciplina />} />
            <Route path="ponto" element={<Ponto />} />
            <Route path="horas" element={<Horas />} />
            <Route path="assuncao" element={<Assuncao />} />
            <Route path="inteligencia" element={<Inteligencia />} />
            <Route path="doesp" element={<Doesp />} />
            <Route path="boletim" element={<Boletim />} />
            <Route path="ocorrencia" element={<Ocorrencia />} />
            <Route path="hierarquia" element={<Hierarquia />} />
            <Route path="comunicados" element={<Comunicado />} />
            <Route path="bau" element={<Arsenal />} />
            <Route path="cursos" element={<Cursos />} />
            <Route path="cursos/cadastro" element={<CadastroCursosPage />} />
            <Route path="anuncio" element={<Anuncio />} />
            <Route path="entrada-saida" element={<EntradaSaida />} />
            <Route path="aparencia" element={<Aparencia />} />
            <Route path="equipe" element={<Equipe />} />
          </Route>
          <Route path="/cidadao" element={<Cidadao />} />
          <Route path="/transcript/:userId" element={<Transcript />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <RodapePublico />
      </div>
    </BrowserRouter>
  )
}

/** No painel o rodapé fica dentro da coluna de conteúdo (ao lado do menu), não embaixo da página inteira. */
function RodapePublico() {
  const { pathname } = useLocation()
  return pathname.startsWith('/painel') || pathname === '/' || pathname === '/entrar' ? null : <Footer />
}

/** A entrada (/ e /entrar) tem o próprio fundo em vídeo. */
function FundoPublico() {
  const { pathname } = useLocation()
  return pathname === '/' || pathname === '/entrar' ? null : <Background />
}
