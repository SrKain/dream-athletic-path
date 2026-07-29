import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/i18n-provider";
import { AuthProvider } from "./auth-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </I18nProvider>
  );
}
