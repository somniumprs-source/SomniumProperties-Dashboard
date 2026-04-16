# layout-review

Revisa o layout de uma seccao do CRM e redesenha com layout profissional e amigo do utilizador.

## Instrucoes

1. Identifica a seccao a redesenhar (o utilizador indica qual, ou analisa screenshot).

2. Le o componente actual. Identifica:
   - Estrutura HTML/JSX
   - Classes Tailwind usadas
   - Dados que renderiza
   - Problemas visuais: espacamentos inconsistentes, hierarquia visual fraca, elementos desalinhados, falta de feedback visual

3. Redesenha seguindo o padrao Somnium Properties:
   - Palette: brand gold #C9A84C, brand dark #0d0d0d, neutral backgrounds #f5f5f0
   - Headers: texto bold neutral-800, subtitulos neutral-400
   - Cards: bg-white rounded-xl border border-neutral-100 shadow-sm
   - Botoes primarios: bg-[#C9A84C] text-white rounded-lg
   - Hover states em todos os elementos interactivos
   - Responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
   - Sem emojis no UI. Usar icones Lucide.

4. Apresenta 2-3 opcoes ao utilizador antes de implementar (se a mudanca for significativa).

5. Implementa, faz build, commit e push.

## Quando usar

- Utilizador diz que algo esta "feio", "basico" ou "pouco profissional"
- Ao adicionar nova seccao/tab que precisa de layout consistente
- Apos adicionar funcionalidade nova que ficou com layout default

## Quando nao usar

- Para corrigir bugs de logica (usar crm-audit)
- Para alterar PDFs (usar pdf-upgrade)
