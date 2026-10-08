/**
 * Catálogo de templates de e-mail.
 * O conteúdo final será desenvolvido depois — aqui fica só a arquitetura,
 * com assunto e corpo placeholder por tipo de disparo.
 */
export type EmailTemplate =
  | "welcome"
  | "athlete_invite"
  | "stage_changed"
  | "stage_advancement_celebration"
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

/**
 * Premium celebration email layout following UI&UX.md specifications.
 * Dark Premium theme with emerald and gold accents, mobile-first design.
 */
function celebrationLayout(
  athleteName: string,
  previousStage: string,
  newStage: string,
  customMessage: string,
  portalLink: string,
) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <title>Congratulations - New Stage Achieved!</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0b0c;font-family:'Inter',Helvetica,Arial,sans-serif;color:#f5f5f4;line-height:1.6;">
  
  <!-- Main Container -->
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    
    <!-- Card Container -->
    <div style="background-color:#141416;border:1px solid #26262a;border-radius:16px;padding:32px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
      
      <!-- Eyebrow - Gold Trophy Header -->
      <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#eab308;margin-bottom:16px;">
        🏆 NEW STAGE ACHIEVED
      </div>
      
      <!-- Title - Space Grotesk -->
      <h1 style="margin:0 0 24px;font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:#f5f5f4;line-height:1.3;">
        Congratulations, ${athleteName}!<br>
        You've Levelled Up! 🎉
      </h1>
      
      <!-- Stage Transition Card -->
      <div style="background-color:#1a1a1c;border:1px solid #26262a;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:13px;color:#a1a1a0;margin-bottom:8px;">Your journey</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:14px;color:#c9c9c7;font-weight:500;">${previousStage}</span>
          <span style="color:#30b884;font-size:18px;">→</span>
          <span style="font-size:16px;color:#30b884;font-weight:600;">${newStage}</span>
        </div>
      </div>
      
      <!-- Custom Message Body -->
      <div style="font-size:15px;line-height:1.7;color:#e5e5e3;margin-bottom:32px;">
        ${customMessage}
      </div>
      
      <!-- CTA Button - Liquid Button Style -->
      <div style="text-align:center;">
        <a href="${portalLink}" 
           style="display:inline-block;
                  min-height:48px;
                  padding:14px 32px;
                  background:linear-gradient(135deg, #30b884 0%, #26a074 100%);
                  color:#ffffff;
                  text-decoration:none;
                  border-radius:12px;
                  font-weight:600;
                  font-size:16px;
                  box-shadow:0 4px 12px rgba(48,184,132,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
                  transition:all 0.3s ease;">
          🎊 View Your Portal
        </a>
      </div>
      
      <!-- Footer Note -->
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #26262a;font-size:13px;color:#737373;text-align:center;">
        Keep up the amazing work! Your dedication is bringing you closer to your dream every day.
      </div>
      
    </div>
    
    <!-- Small Footer -->
    <div style="text-align:center;margin-top:24px;font-size:12px;color:#525252;">
      Go Team Go - Your Athletic Journey Partner
    </div>
    
  </div>
  
</body>
</html>`;
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
    case "stage_advancement_celebration":
      return {
        subject: `🎉 Congratulations ${name}! You've reached ${data.newStage ?? "a new stage"}!`,
        html: celebrationLayout(
          name,
          String(data.previousStage ?? "Previous Stage"),
          String(data.newStage ?? "New Stage"),
          String(
            data.customMessage ??
              "<p>You've successfully advanced to the next stage of your athletic journey!</p>",
          ),
          String(data.portalLink ?? "#"),
        ),
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
