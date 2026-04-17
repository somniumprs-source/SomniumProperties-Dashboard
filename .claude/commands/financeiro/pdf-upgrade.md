# pdf-upgrade

Melhora um ou mais documentos PDF gerados pelo CRM: adiciona fotos, melhora layout, torna apresentavel para investidores e profissionais.

## Pre-requisito

Antes de executar, ler `.claude/dept/financeiro.md` para contexto do departamento financeiro.

## Instrucoes

1. Identifica o(s) tipo(s) de documento a melhorar. Os 18 tipos disponiveis estao em `src/db/pdfImovelDocs.js` (GENERATORS) e `src/db/pdfReport.js`.

2. Le o gerador actual do documento. Nao ler o ficheiro inteiro: usar grep para encontrar o gerador especifico (ex: `grep -n "ficha_imovel:" src/db/pdfImovelDocs.js`).

3. Verifica se o documento ja inclui:
   - Capa com logo Somnium Properties
   - Fotos do imovel (funcao `parseFotos()`)
   - Headers com linha dourada
   - Footer com data e referencia
   - Dados da analise de rentabilidade (quando aplicavel)

4. Melhora seguindo o padrao profissional:
   - Usar o `DocBuilder` para layout consistente (header, section, row, bigNumbers, simpleTable, photos)
   - Fotos: max 6 por documento, grid 2 colunas, rounded corners
   - Cores: gold #C9A84C, black #0d0d0d, body #2a2a2a, muted #888
   - Logo: `public/logo-transparent.png`
   - Capa sempre presente em documentos para investidor

5. Testa gerando o PDF via curl: `curl -o test.pdf http://localhost:3001/api/crm/imoveis/{id}/documento/{tipo}`

6. Verifica o tamanho (deve ser maior se adicionou fotos).

7. Build, commit e push.

## Quando usar

- Utilizador quer PDFs mais profissionais
- Ao adicionar novo tipo de documento
- Quando fotos nao aparecem nos PDFs

## Quando nao usar

- Para alterar layout do CRM no browser (usar /geral/layout-review)
