# Gestão — Painel do Restaurante Fontenele

Use o [sistema de design](../MASTER.md) como base. Estas regras detalham a rota `/gestao`.

## Ordem das tarefas

1. Resuma a publicação do cardápio, a quantidade de itens no editor, o tempo de espera e a configuração de recebimento.
2. Priorize o editor de cardápio. Mantenha nome, preço, categoria, descrição e foto associados ao prato. Diferencie rascunho de cardápio publicado.
3. Agrupe WhatsApp, taxa de entrega, espera e chave Pix em **Pedidos e recebimento**. O Pix informa a chave que acompanha o pedido no WhatsApp.

## Layout e estados

- Em telas estreitas, acomode a navegação no topo e deixe formulários e cartões refluírem. Em telas largas, use navegação lateral com entrada ativa identificada.
- Mantenha **Publicar cardápio** e **Salvar configurações** em seus próprios formulários. Informe progresso, sucesso ou erro na área correspondente.
- Confira a visibilidade do foco com teclado, em especial ao percorrer os últimos campos com a barra de publicação aderente. Confira também 375 px, orientação paisagem e movimento reduzido.

## Pontos verificados no código

- O painel usa a paleta definida no documento principal, navegação que se adapta à largura e rótulos em campos de configuração e edição.
- A validação associa os erros aos campos e leva o foco ao primeiro campo inválido. A melhoria identificada para envios com vários erros é acrescentar um resumo focalizável com links para os campos, preservando as mensagens individuais.
