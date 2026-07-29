/**
 * Catálogo de templates de e-mail.
 * O conteúdo final será desenvolvido depois — aqui fica só a arquitetura,
 * com assunto e corpo placeholder por tipo de disparo.
 */
export type EmailTemplate =
  | "welcome"
  | "athlete_invite"
  | "stage_changed"
  | "document_requested"
  | "document_approved"
  | "document_rejected"
  | "password_reset";

export interface RenderedEmail {
  subject: string;
  html: string;
}

type Data = Record<string, string | number | undefined>;

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#f5f5f4">
  <div style="max-width:560px;margin:0 auto;background:#141416;border-radius:16px;padding:32px">
    <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#c9c9c7">${body}</div>
  </div></body></html>`;
}

export function renderEmail(template: EmailTemplate, data: Data = {}): RenderedEmail {
  const name = String(data.name ?? "");
  switch (template) {
    case "welcome":
      return {
        subject: "Bem-vindo à plataforma",
        html: layout("Bem-vindo", `<p>Olá ${name}, sua conta foi criada.</p>`),
      };
    case "athlete_invite":
      return {
        subject: "Seu acesso à plataforma",
        html: layout(
          "Você foi convidado",
          `<p>Olá ${name}, a agência criou seu perfil de atleta.</p>
           <p><a href="${data.inviteUrl ?? "#"}" style="color:#c6f24e">Ativar meu acesso</a></p>`,
        ),
      };
    case "stage_changed":
      return {
        subject: "Sua etapa foi atualizada",
        html: layout("Pipeline atualizado", `<p>Nova etapa: <b>${data.stage ?? ""}</b>.</p>`),
      };
    case "document_requested":
      return {
        subject: "Novo documento solicitado",
        html: layout("Documento solicitado", `<p>${data.document ?? ""}</p>`),
      };
    case "document_approved":
      return {
        subject: "Documento aprovado",
        html: layout("Documento aprovado", `<p>${data.document ?? ""} foi aprovado.</p>`),
      };
    case "document_rejected":
      return {
        subject: "Documento reprovado",
        html: layout(
          "Documento reprovado",
          `<p>${data.document ?? ""} foi reprovado.</p><p>${data.reason ?? ""}</p>`,
        ),
      };
    case "password_reset":
      return {
        subject: "Recuperação de senha",
        html: layout(
          "Recuperar senha",
          `<p><a href="${data.resetUrl ?? "#"}" style="color:#c6f24e">Definir nova senha</a></p>`,
        ),
      };
  }
}