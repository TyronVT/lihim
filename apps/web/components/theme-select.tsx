"use client";

import { copy } from "@/lib/copy";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import { SegmentedControl } from "./form";

/** System / Dark / Light override (persists per device; applied before paint on reload). */
export function ThemeSelect({ className }: { className?: string }) {
  const [pref, setPref] = useThemePreference();
  return (
    <SegmentedControl<ThemePreference>
      label={copy.theme.label}
      value={pref}
      onValueChange={setPref}
      className={className}
      options={[
        { value: "system", label: copy.theme.system },
        { value: "dark", label: copy.theme.dark },
        { value: "light", label: copy.theme.light },
      ]}
    />
  );
}
