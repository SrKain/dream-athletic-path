# Quick Facts — Ana Carolina Martins

Exemplo gerado pelo renderer real, sem banco de dados ou envio de e-mail:

```sh
bun scripts/render-mailer-quick-facts-preview.ts
```

Abra [o HTML](ana-carolina-quick-facts.html) ou [o texto](ana-carolina-quick-facts.txt).
Os oito fatos foram fornecidos pelo solicitante; bio/fit são ilustrativos. Nenhuma foto pessoal foi fornecida. A comparação usa a especificação textual do pedido, pois o print não foi anexado à conversa.

| Ordem | Rótulo | Valor | Ícone |
| --- | --- | --- | --- |
| 1 | POSITION | Setter | star |
| 2 | HEIGHT | 5'7" (170 cm) | height |
| 3 | GPA | 3.31 | gradCap |
| 4 | CURRENT SCHOOL | Eastern Wyoming College | academic |
| 5 | STATUS | Sophomore | arrowGold |
| 6 | AVAILABLE | Fall 2025 | film |
| 7 | INTENDED MAJOR | Computer Engineering | academic |
| 8 | FROM | 🇧🇷 Brazil | bandeira; globe sem bandeira |

Cabeçalho amarelo, nome em caixa alta e subtítulo `SETTER | 5'7" (170 CM) | BRAZIL` preservados. A tabela tem barra verde escura, painel claro, divisórias e rótulos 12px. Contraste calculado: 6,08:1. Somente o chip TRANSFER aparece. Não há linhas High School Graduation/College Start Date nem chips GPA/AVAILABLE.

HTML e texto compartilham a mesma definição ordenada. Os testes dos templates, envio simulado e enfileiramento simulado comparam as oito linhas e sua quantidade por atleta. Se faltar um valor, a respectiva linha é omitida em ambas as versões.

Os adaptadores antigos de `recruit-email.ts` e `email-layout.ts` delegam ao card canônico; `renderAthleteGrid` permanece como utilitário de contêiner sem consumidor nos canais auditados. O catálogo institucional não renderiza cards. Nenhum caminho de envio mantém a tabela antiga.

A fila persiste snapshots: itens já enfileirados continuam com seu HTML/texto original. Novos previews/campanhas após deploy usam a correção. Não houve reprocessamento nem envio real.

O limite artificial do antigo teste de oito cards compactos foi substituído pela verificação de oito cards completos, sem duplicação, e crescimento linear. O exemplo com oito fichas completas mede aproximadamente 112 KiB; o aviso existente no Mailer acima de 90 KiB continua alertando sobre possível corte do Gmail perto de 102 KiB. Nenhuma seção foi truncada para cumprir o teste antigo.
