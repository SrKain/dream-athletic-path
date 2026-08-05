/**
 * Placeholder replacement utility for email templates.
 * Supports dynamic content injection with type-safe placeholders.
 */

export interface PlaceholderData {
  athlete_name?: string;
  athlete_first_name?: string;
  previous_stage?: string;
  new_stage?: string;
  agency_name?: string;
  portal_link?: string;
}

/**
 * List of all supported placeholders for documentation and UI display.
 */
export const AVAILABLE_PLACEHOLDERS = [
  {
    key: "{{athlete_name}}",
    description: "Full name of the athlete",
    example: "John Smith",
  },
  {
    key: "{{athlete_first_name}}",
    description: "First name only",
    example: "John",
  },
  {
    key: "{{previous_stage}}",
    description: "Name of the previous stage",
    example: "Video and Exposure",
  },
  {
    key: "{{new_stage}}",
    description: "Name of the new stage achieved",
    example: "Negotiation",
  },
  {
    key: "{{agency_name}}",
    description: "Name of the agency",
    example: "Go Team Go",
  },
  {
    key: "{{portal_link}}",
    description: "Direct link to athlete's portal with celebration",
    example: "https://app.example.com/portal?celebrate=true",
  },
] as const;

/**
 * Replaces all placeholders in a template string with actual values.
 *
 * @param template - The template string containing {{placeholder}} markers
 * @param data - Object containing the values to replace placeholders with
 * @returns The template with all placeholders replaced. Unreplaced placeholders remain as-is.
 *
 * @example
 * ```typescript
 * const message = "Congratulations {{athlete_first_name}}! You've reached {{new_stage}}!";
 * const result = replacePlaceholders(message, {
 *   athlete_first_name: "Maria",
 *   new_stage: "Negotiation"
 * });
 * // Result: "Congratulations Maria! You've reached Negotiation!"
 * ```
 */
export function replacePlaceholders(template: string, data: PlaceholderData): string {
  let result = template;

  // Replace each placeholder with its corresponding value
  if (data.athlete_name) {
    result = result.replace(/\{\{athlete_name\}\}/g, data.athlete_name);
  }

  if (data.athlete_first_name) {
    result = result.replace(/\{\{athlete_first_name\}\}/g, data.athlete_first_name);
  }

  if (data.previous_stage) {
    result = result.replace(/\{\{previous_stage\}\}/g, data.previous_stage);
  }

  if (data.new_stage) {
    result = result.replace(/\{\{new_stage\}\}/g, data.new_stage);
  }

  if (data.agency_name) {
    result = result.replace(/\{\{agency_name\}\}/g, data.agency_name);
  }

  if (data.portal_link) {
    result = result.replace(/\{\{portal_link\}\}/g, data.portal_link);
  }

  return result;
}

/**
 * Extracts the first name from a full name string.
 *
 * @param fullName - The full name (e.g., "John Smith")
 * @returns The first name (e.g., "John")
 */
export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * Generates example placeholder data for previewing templates.
 */
export function getExamplePlaceholderData(): PlaceholderData {
  return {
    athlete_name: "Maria Silva",
    athlete_first_name: "Maria",
    previous_stage: "Video and Exposure",
    new_stage: "Negotiation",
    agency_name: "Go Team Go",
    portal_link: "https://app.example.com/portal?celebrate=true",
  };
}
