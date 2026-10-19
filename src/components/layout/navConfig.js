import { LayoutDashboard, Bell, BookOpen, Map, Megaphone, CalendarClock, Timer, FileBarChart, Headphones, Handshake, Construction, Wallet, UserCog, ShieldCheck } from 'lucide-react'

// Menu por secções. As rotas e as áreas de permissão são as de sempre;
// só mudam o agrupamento e os nomes visíveis.
// `area` da secção: quem a pode ver vê todos os itens dela (tal como o
// antigo grupo expansível "Administração").
export const NAV_SECOES = [
  {
    label: 'Administração', area: 'administracao',
    items: [
      { to: '/',                         label: 'Dashboard',           Icon: LayoutDashboard, end: true, area: 'dashboard' },
      { to: '/administracao/agenda',     label: 'Agenda',              Icon: CalendarClock, area: 'operacoes' },
      { to: '/administracao/operacoes',  label: 'Operações',           Icon: Timer, badgeKey: 'tarefas', area: 'operacoes' },
      { to: '/administracao/relatorios', label: 'Relatórios',          Icon: FileBarChart, area: 'administracao' },
      { to: '/administracao/sop',        label: 'SOPs',                Icon: BookOpen, area: 'administracao' },
      { to: '/administracao/regiao',     label: 'Regiões',             Icon: Map, area: 'administracao' },
      { to: '/administracao/chamadas',   label: 'Avaliação de calls',  Icon: Headphones, area: 'administracao' },
    ],
  },
  {
    label: 'Departamentos',
    items: [
      { to: '/crm',        label: 'Departamento Comercial',  Icon: Handshake, badgeKey: 'crm', area: 'crm' },
      { to: '/projectos',  label: 'Departamento de Obras',      Icon: Construction, area: 'projectos' },
      { to: '/financeiro', label: 'Departamento Financeiro', Icon: Wallet, area: 'financeiro' },
      { to: '/marketing',  label: 'Departamento de Marketing',  Icon: Megaphone, area: 'marketing' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/alertas',            label: 'Alertas',      Icon: Bell, badgeKey: 'alertas', area: 'alertas' },
      { to: '/admin/utilizadores', label: 'Utilizadores', Icon: UserCog, area: 'admin' },
      { to: '/admin/auditoria',    label: 'Auditoria',    Icon: ShieldCheck, area: 'admin' },
    ],
  },
]

/** Admin vê tudo; sem role, tudo menos `admin`; restantes, só as `areas` declaradas pelo backend. */
export function podeVer(area, role, areas = []) {
  if (role === 'admin') return true
  if (!role) return area !== 'admin'
  return areas.includes(area)
}

/** Secções com os itens visíveis para este utilizador (secções vazias saem). */
export function navVisivel(role, areas = []) {
  return NAV_SECOES.map(s => {
    const items = s.items.filter(i => podeVer(i.area, role, areas) || (s.area && podeVer(s.area, role, areas)))
    return items.length ? { ...s, items } : null
  }).filter(Boolean)
}
