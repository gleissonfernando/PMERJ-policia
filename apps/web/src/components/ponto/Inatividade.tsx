import { BellRing, CalendarX2, ExternalLink, ShieldOff, TriangleAlert, UserX } from 'lucide-react'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardHeader, Field, Input, Select, Switch } from '@/components/form'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { CanalTexto } from '@/lib/discord'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import type { CasoInatividade, InatividadeInput, PontoEstado, PontoInput } from '@/lib/ponto'

const nn = (n: number) => String(n).padStart(4, '0')
const DIA = 86_400_000

/* ---------- Configurações ---------- */

export function ConfigLembrete({ data, draft, patch }: { data: PontoEstado; draft: PontoInput; patch: (p: Partial<PontoInput>) => void }) {
  const destinos = data.destinosAssuncao
  const canal = (id: string) => data.canais.find((c) => c.id === id)?.nome
  return (
    <Card>
      <CardHeader icon={<BellRing className="size-4.5" />} title="Lembrete da assunção de serviço" hint="Ao fechar o ponto, o policial recebe na DM um painel com botão que leva direto ao painel da assunção." />
      <div className="grid gap-4 p-6">
        <div className="divide-y divide-line rounded-[14px] border border-line px-4">
          <Switch
            checked={draft.lembreteAssuncao}
            onChange={(lembreteAssuncao) => patch({ lembreteAssuncao })}
            label="Enviar lembrete ao fechar o ponto"
            description="Vale para o botão Sair de serviço e para a saída do canal de voz."
          />
        </div>
        {destinos.length === 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/8 px-4 py-3 text-xs text-[#fbbf24]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Nenhum painel de Assunção de Serviço publicado: o lembrete só sai quando houver um. Publique em Assunção de Serviço.
          </p>
        ) : (
          <div className="grid gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Botões do lembrete</span>
            <ul className="flex flex-wrap gap-1.5">
              {destinos.map((d) => (
                <li key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs font-semibold">
                  <ExternalLink className="size-3 text-muted" /> {d.nome}
                  <span className="font-normal text-muted">· #{canal(d.canalId) ?? 'canal'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

export function ConfigInatividade({ data, draft, patch, canaisTexto }: { data: PontoEstado; draft: PontoInput; patch: (p: Partial<PontoInput>) => void; canaisTexto: CanalTexto[] }) {
  const ina = draft.inatividade
  const set = (p: Partial<InatividadeInput>) => patch({ inatividade: { ...ina, ...p } })
  const decisaoVazia = ina.cargosDecisao.length === 0 && draft.cargosGestao.length === 0
  return (
    <Card>
      <CardHeader
        icon={<CalendarX2 className="size-4.5" />}
        title="Inatividade"
        hint={`Quem passar ${ina.dias} ${ina.dias === 1 ? 'dia' : 'dias'} sem bater ponto entra em revisão (ou é exonerado direto, no modo automático).`}
        action={
          <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest', ina.ativo ? 'border-success/35 bg-success/10 text-success' : 'border-line text-muted')}>
            {ina.ativo ? 'Ligada' : 'Desligada'}
          </span>
        }
      />
      <div className="grid gap-5 p-6">
        <div className="divide-y divide-line rounded-[14px] border border-line px-4">
          <Switch
            checked={ina.ativo}
            onChange={(ativo) => set({ ativo })}
            label="Verificar inatividade"
            description="A contagem começa no dia em que for ligada: ninguém é cobrado por dias anteriores. Confere a cada 30 minutos."
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Dias sem bater ponto" htmlFor="in-dias" hint="Conta desde o último ponto (ou a entrada no servidor, se nunca bateu).">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <Input id="in-dias" type="number" min={1} max={60} value={ina.dias} onChange={(e) => set({ dias: Math.max(1, Math.min(60, Math.round(Number(e.target.value) || 1))) })} />
              <span className="text-sm text-muted">dias</span>
            </div>
          </Field>
          <Field label="O que acontece" htmlFor="in-modo" hint={ina.modo === 'revisao' ? 'Abre um canal com o relatório de ponto e os botões Exoneração / Cancelar.' : 'Exonera na hora: DM com o motivo, expulsão e log. Sem revisão humana.'}>
            <Select id="in-modo" value={ina.modo} onChange={(e) => set({ modo: e.target.value as InatividadeInput['modo'] })}>
              <option value="revisao">Revisão — canal com relatório e botões</option>
              <option value="automatico">Automático — exonera direto</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid content-start gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
              <ShieldOff className="size-3.5" /> Cargos de ausência · {ina.cargosAusencia.length} de 25
            </span>
            <CargoPicker id="in-ausencia" cargos={data.cargos} selecionados={ina.cargosAusencia} onChange={(cargosAusencia) => set({ cargosAusencia })} max={25} />
            <p className="text-xs text-muted">Quem tem um destes cargos nunca é cobrado nem exonerado (licença, férias…).</p>
          </div>
          <div className="grid content-start gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Quem decide · {ina.cargosDecisao.length} de 25</span>
            <CargoPicker id="in-decisao" cargos={data.cargos} selecionados={ina.cargosDecisao} onChange={(cargosDecisao) => set({ cargosDecisao })} max={25} />
            <p className={cn('text-xs', decisaoVazia && ina.modo === 'revisao' ? 'font-semibold text-[#f59e0b]' : 'text-muted')}>
              {ina.cargosDecisao.length ? 'Veem o canal e apertam Exoneração / Cancelar.' : decisaoVazia ? 'Escolha quem decide (ou cargos de Gestão do ponto): sem isso, ninguém vê o canal.' : 'Vazio: vale a Gestão do ponto.'}
            </p>
          </div>
        </div>

        <Field label="Canal de log das exonerações" htmlFor="in-log" hint="Sai o motivo: falta de comparecimento, sem ter batido ponto. Vazio = canal de registro do ponto.">
          <CanalSelect id="in-log" canais={canaisTexto} value={ina.canalLogId} onChange={(canalLogId) => set({ canalLogId })} vazio="Usar o registro do ponto" />
        </Field>
      </div>
    </Card>
  )
}

/* ---------- Aba "Inatividade" ---------- */

const STATUS: Record<CasoInatividade['status'], { label: string; cls: string }> = {
  aberto: { label: 'Em revisão', cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
  exonerado: { label: 'Exonerado', cls: 'border-danger/40 bg-danger/10 text-danger' },
  cancelado: { label: 'Cancelado', cls: 'border-line-strong bg-surface-2 text-muted' },
  resolvido: { label: 'Encerrado', cls: 'border-success/35 bg-success/10 text-success' },
}

export function CasosInatividade({ data }: { data: PontoEstado }) {
  const ina = data.inatividade
  if (!ina) return null
  return (
    <div className="grid gap-5">
      {!data.config.inatividade.ativo && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> A verificação de inatividade está desligada. A administração liga em Configurações.
        </p>
      )}
      <Card>
        <CardHeader icon={<UserX className="size-4.5" />} title="Em revisão" hint="Casos abertos: decida no canal do Discord (Exoneração ou Cancelar)." />
        {ina.abertos.length === 0 ? <EmptyState icon={UserX}>Ninguém em revisão por inatividade.</EmptyState> : <Lista casos={ina.abertos} />}
      </Card>
      <Card>
        <CardHeader icon={<CalendarX2 className="size-4.5" />} title="Últimos casos" hint="Exonerados, cancelados e encerrados sozinhos (bateu ponto, saiu ou ganhou ausência)." />
        {ina.recentes.length === 0 ? <EmptyState icon={CalendarX2}>Nenhum caso decidido ainda.</EmptyState> : <Lista casos={ina.recentes} />}
      </Card>
    </div>
  )
}

function Lista({ casos }: { casos: CasoInatividade[] }) {
  return (
    <ul className="divide-y divide-line">
      {casos.map((c) => {
        const dias = Math.floor(((c.decisao?.em ?? c.abertoEm) - c.semPontoDesde) / DIA)
        return (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <img src={avatarUrl({ id: c.userId, avatar: c.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="truncate font-semibold">{c.nome}</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest', STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                <span className="font-display text-xs text-muted">#{nn(c.numero)}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">
                {dias} {dias === 1 ? 'dia' : 'dias'} sem ponto · desde {fmtDataHora(c.semPontoDesde)}
                {c.decisao && c.status !== 'aberto' && ` · ${c.decisao.por.nome}`}
              </div>
            </div>
            {c.status === 'aberto' && c.canalUrl ? (
              <a href={c.canalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border border-line px-3 text-xs font-bold text-muted transition hover:border-line-strong hover:text-ink">
                Abrir canal <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(c.decisao?.em ?? c.abertoEm)}>
                {fmtRelativo(c.decisao?.em ?? c.abertoEm)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
