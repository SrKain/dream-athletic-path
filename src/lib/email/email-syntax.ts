/**
 * Validação rigorosa e determinística de sintaxe de e-mail (E1).
 * Não utiliza regex permissiva ou ingênua (ex: apenas includes("@")).
 * Rejeita endereços que causariam rejeição pelo provedor (Resend/SMTP).
 */
export function isDeliverableEmailSyntax(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const raw = email.trim().toLowerCase();

  if (raw.length === 0 || raw.length > 254) return false;

  // Sem espaços em branco em qualquer parte
  if (/\s/.test(raw)) return false;

  // Caracteres proibidos no endereço
  const INVALID_CHARS = [",", ";", "\\", "/", "[", "]", '"', "(", ")", "<", ">"];
  if (INVALID_CHARS.some((char) => raw.includes(char))) return false;

  // Exatamente um símbolo @
  const atParts = raw.split("@");
  if (atParts.length !== 2) return false;

  const [localPart, domainPart] = atParts;

  // Parte local: 1 a 64 caracteres, sem pontos consecutivos, sem começar/terminar com ponto
  if (!localPart || localPart.length > 64) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
  if (localPart.includes("..")) return false;

  // Parte do domínio: 3 a 253 caracteres, deve conter ao menos um ponto, sem pontos consecutivos
  if (!domainPart || domainPart.length > 253) return false;
  if (
    domainPart.startsWith(".") ||
    domainPart.endsWith(".") ||
    domainPart.startsWith("-") ||
    domainPart.endsWith("-")
  ) {
    return false;
  }
  if (domainPart.includes("..")) return false;

  const domainLabels = domainPart.split(".");
  if (domainLabels.length < 2) return false;

  for (const label of domainLabels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
  }

  // TLD (último label) deve ter ao menos 2 caracteres e conter apenas letras
  const tld = domainLabels[domainLabels.length - 1];
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;

  // Regex estrutural RFC 5322 simplificada
  const rfcRegex =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  return rfcRegex.test(raw);
}

/**
 * Normaliza e sanitiza um e-mail para caixa baixa e sem espaços.
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Extrai o domínio de um e-mail válido, ou retorna null se a sintaxe for inválida.
 */
export function extractEmailDomain(email: unknown): string | null {
  if (!isDeliverableEmailSyntax(email)) return null;
  const parts = String(email).trim().toLowerCase().split("@");
  return parts[1] || null;
}
