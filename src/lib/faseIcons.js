// Ícones das fases de projeto (kanban do Departamento de Obras e acordeão da
// ficha do projeto). Um só sítio para todos os modelos de negócio.
import {
  FileSearch, KeyRound, ClipboardList, DraftingCompass, Pickaxe, BrickWall, PaintRoller, Fence, Tag, Flag,
  UserSearch, MessagesSquare, FileSignature, ArrowRightLeft, BadgeEuro,
  ClipboardSignature, Wrench, Globe, DoorOpen, Inbox, Stamp,
  ScanSearch, Route, Hammer, PackageCheck, ReceiptText,
} from 'lucide-react'

export const FASE_ICONS = {
  // Fix and Flip / CAEP
  pre_aquisicao: FileSearch,
  aquisicao: KeyRound,
  pre_obra: ClipboardList,
  projeto_licenca: DraftingCompass,
  demolicoes: Pickaxe,
  estrutura_especialidades: BrickWall,
  acabamentos: PaintRoller,
  exterior_fecho: Fence,
  comercializacao: Tag,
  vendido: Flag,
  // Wholesaling
  procurar_investidor: UserSearch,
  negociacao_investidor: MessagesSquare,
  cpcv_compra: FileSignature,
  cpcv_cedencia: ArrowRightLeft,
  fee_recebido: BadgeEuro,
  // Mediação Imobiliária
  captacao: ClipboardSignature,
  preparacao_imovel: Wrench,
  publicacao: Globe,
  visitas: DoorOpen,
  propostas: Inbox,
  cpcv: FileSignature,
  escritura: Stamp,
  // Consultoria/Assessoria
  cons_proposta: FileSignature,
  cons_diagnostico: ScanSearch,
  cons_plano: Route,
  cons_execucao: Hammer,
  cons_entrega: PackageCheck,
  cons_fecho: ReceiptText,
}

export const FASE_ICON_DEFAULT = Wrench
