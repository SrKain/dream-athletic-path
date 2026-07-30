import { useEffect, useMemo, useState } from "react";

import { inputClass } from "@/components/admin-ui";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: SearchableSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((item) => item.value === value);

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((item) => item.label.toLowerCase().includes(term));
  }, [options, query]);

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-lg">
          {filteredOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(item.value);
                setQuery(item.label);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.value === value && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
