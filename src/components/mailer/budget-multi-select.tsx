import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DollarSign, Check, ChevronDown, X } from "lucide-react";
import { BUDGET_LEVELS } from "@/lib/universities-constants";
import type { UniversityBudgetLevel } from "@/types/db";

export interface BudgetMultiSelectProps {
  selected: UniversityBudgetLevel[];
  onChange: (levels: UniversityBudgetLevel[]) => void;
  className?: string;
}

const BUDGET_LABELS: Record<UniversityBudgetLevel, string> = {
  "0–1000": "$0 – $1,000 / ano",
  "1000–5000": "$1,000 – $5,000 / ano",
  "5000–10000": "$5,000 – $10,000 / ano",
  "10000+": "$10,000+ / ano",
};

export function BudgetMultiSelect({ selected, onChange, className = "" }: BudgetMultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggleLevel(level: UniversityBudgetLevel) {
    if (selected.includes(level)) {
      onChange(selected.filter((item) => item !== level));
    } else {
      onChange([...selected, level]);
    }
  }

  function selectAll() {
    onChange([...BUDGET_LEVELS]);
  }

  function clearAll() {
    onChange([]);
  }

  const label =
    selected.length === 0
      ? "Budget: Todos"
      : selected.length === BUDGET_LEVELS.length
        ? "Budget: Todas as faixas"
        : `Budget: ${selected.length} faixa(s)`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-between gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors min-h-[34px] sm:col-span-4 cursor-pointer ${
            selected.length > 0
              ? "border-primary/50 text-foreground font-semibold"
              : "text-muted-foreground"
          } ${className}`}
          aria-label="Filtrar por faixas de orçamento"
        >
          <div className="flex items-center gap-1.5 truncate">
            <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-lg rounded-xl z-50 space-y-2.5"
      >
        <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800 text-xs">
          <span className="font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider text-[11px]">
            Faixas de Orçamento
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
            >
              Todas
            </button>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {BUDGET_LEVELS.map((level) => {
            const isChecked = selected.includes(level);
            return (
              <label
                key={level}
                onClick={() => toggleLevel(level)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors min-h-[40px] select-none ${
                  isChecked
                    ? "bg-primary/10 text-primary-900 dark:text-primary-100 font-semibold"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isChecked
                      ? "bg-emerald-700 border-emerald-700 text-white"
                      : "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span>{BUDGET_LABELS[level]}</span>
              </label>
            );
          })}
        </div>

        {selected.length > 0 && (
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90"
            >
              Aplicar ({selected.length})
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
