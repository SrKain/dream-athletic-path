# Acesso do atleta definido pela agência (login + senha)

Hoje o único caminho para o atleta acessar o portal é o convite por e-mail (`inviteAthlete`), que depende do atleta clicar num link e escolher a própria senha. A agência passa a criar e controlar a credencial diretamente na tela do atleta.

## Como fica na tela do atleta (Admin)

Novo bloco **Acesso ao portal**, junto aos dados do atleta:

- Status da conta: "Sem acesso" / "Acesso ativo" (mostra o e-mail de login).
- Campo **E-mail de acesso** (pré-preenchido com o e-mail do atleta).
- Campo **Senha** + **Confirmar senha**, com botão "Gerar senha forte" e opção de exibir o valor para copiar e repassar ao atleta.
- Botão **Criar acesso** (quando não existe conta) ou **Redefinir senha** (quando já existe).
- Botão **Revogar acesso**, que desvincula a conta e impede o login no portal.
- O convite por e-mail continua disponível como alternativa.

Regras: senha mínima de 8 caracteres, as duas devem coincidir, e a senha em texto claro nunca é salva em banco — aparece só uma vez na tela, para a agência repassar.

## Comportamento

1. **Criar acesso**: cria o usuário de autenticação já confirmado (sem precisar de e-mail), vincula ao registro do atleta, concede o papel `athlete` e o atleta já entra em `/login` com esse e-mail e senha.
2. **Redefinir senha**: troca a senha do usuário existente. O atleta perde a sessão atual e precisa entrar de novo.
3. **Revogar acesso**: remove o papel `athlete` e desvincula o usuário do atleta; o portal deixa de abrir para ele.
4. Se o e-mail informado já pertencer a outro atleta, a operação é recusada com mensagem clara.

## Detalhes técnicos

- Novas server functions em `src/lib/auth.functions.ts`, todas com `.middleware([requireAgency])` e cliente service-role carregado dentro do handler:
  - `setAthleteAccess({ athleteId, email, password })` — `auth.admin.createUser({ email_confirm: true })` quando não há `user_id`; caso contrário `auth.admin.updateUserById(user_id, { password, email })`. Depois atualiza `athletes.user_id`/`email` e faz upsert em `user_roles` (`athlete`).
  - `revokeAthleteAccess({ athleteId })` — remove a linha de `user_roles` do usuário e limpa `athletes.user_id`.
- Validação com zod (e-mail válido, senha ≥ 8, confirmação igual) no cliente e no `inputValidator`.
- Geração de senha forte no cliente via `crypto.getRandomValues`; nada de senha em logs ou toasts persistentes.
- UI isolada num componente `AthleteAccessCard` para não inchar `src/routes/_authenticated/admin/athletes/$id.tsx`.
- Sem mudanças de schema: `athletes.user_id` e `user_roles` já existem.
- Ao final: `bun run validate`.
