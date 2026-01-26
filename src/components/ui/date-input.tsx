import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

export function DateInput({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled = false,
  minDate,
  maxDate,
  className,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [isInvalid, setIsInvalid] = React.useState(false);

  // Sync input value with external value
  React.useEffect(() => {
    if (value && isValid(value)) {
      setInputValue(format(value, "dd/MM/yyyy"));
      setIsInvalid(false);
    } else if (!value) {
      setInputValue("");
      setIsInvalid(false);
    }
  }, [value]);

  const parseAndValidateDate = (text: string): Date | null => {
    if (!text.trim()) return null;

    // Try parsing dd/MM/yyyy format
    const parsed = parse(text, "dd/MM/yyyy", new Date());
    if (isValid(parsed)) {
      // Check min/max constraints
      if (minDate && parsed < minDate) return null;
      if (maxDate && parsed > maxDate) return null;
      return parsed;
    }

    // Try parsing other common formats
    const formats = ["d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "yyyy-MM-dd"];
    for (const fmt of formats) {
      const attemptParsed = parse(text, fmt, new Date());
      if (isValid(attemptParsed)) {
        if (minDate && attemptParsed < minDate) return null;
        if (maxDate && attemptParsed > maxDate) return null;
        return attemptParsed;
      }
    }

    return null;
  };

  const handleInputBlur = () => {
    if (!inputValue.trim()) {
      onChange(undefined);
      setIsInvalid(false);
      return;
    }

    const parsedDate = parseAndValidateDate(inputValue);
    if (parsedDate) {
      onChange(parsedDate);
      setInputValue(format(parsedDate, "dd/MM/yyyy"));
      setIsInvalid(false);
    } else {
      setIsInvalid(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onChange(date);
      setInputValue(format(date, "dd/MM/yyyy"));
      setIsInvalid(false);
    }
    setOpen(false);
  };

  return (
    <div className={cn("flex gap-1", className)}>
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex-1",
          isInvalid && "border-destructive focus-visible:ring-destructive"
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className="shrink-0"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align="end" sideOffset={4}>
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            defaultMonth={value || new Date()}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
            locale={es}
            captionLayout="dropdown-buttons"
            fromYear={1990}
            toYear={2050}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
