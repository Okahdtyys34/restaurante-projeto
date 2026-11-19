# Restaurante Fontenele — Sistema de design

Consulte este documento primeiro. Para o painel do dono, aplique também as regras de [Gestão](pages/dashboard.md).

## Direção visual

- Organize a tela pela tarefa e dê a cada área uma ação principal clara. Use uma grade simples, superfícies opacas e espaçamento consistente.
- Use a tipografia de sistema já definida em `style.css`. Diferencie títulos, rótulos e textos de apoio por tamanho e peso.
- Reserve ícones para ações e estados que eles ajudam a reconhecer. Use um nome acessível nos botões compostos só por ícone e oculte ícones decorativos quando o texto já comunica a mesma informação.

## Cores

| Papel | Cor | Uso |
| --- | --- | --- |
| Marca e ação principal | `#075930` | Navegação, botões principais e confirmações |
| Superfície | `#FEFEFD` | Cartões e texto sobre o verde da marca |
| Destaque | `#FE7C00` | Marcadores visuais acompanhados de texto ou outra indicação de estado |
| Texto principal | `#18271F` | Texto em superfícies claras ou sobre laranja |
| Texto secundário | `#4F6256` | Rótulos auxiliares e instruções |

O texto claro sobre verde tem contraste de 8,39:1. O texto secundário sobre o fundo claro tem 6,47:1. Se o laranja for usado como fundo com texto, use `#18271F` (6,00:1). A combinação de laranja e branco tem 2,57:1, adequada apenas a detalhes decorativos.

## Interação

- Mantenha ordem de teclado previsível, foco visível e rótulos persistentes nos campos. Barras fixas ou aderentes devem deixar o controle em foco visível.
- Mostre o erro junto ao campo, associe a mensagem com `aria-describedby` e indique como corrigi-lo.
- Use animação breve para confirmar uma interação e respeite `prefers-reduced-motion`.

## Origem

A síntese aproveita as recomendações verificadas de Minimalism & Swiss Style, contraste, foco e formulários de `ui-ux-pro-max`. A paleta e a tipografia acima seguem a identidade solicitada e os estilos que o projeto já utiliza.
