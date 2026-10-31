// TOKEN_POLICY_BATCHED_EXECUTION: accessible in-app confirmations also work in the embedded browser.
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useLocale } from "@/i18n/LocaleContext";
type Request = {
  message: string;
  value?: string;
  resolve: (value: string | boolean | null) => void;
  focus: HTMLElement | null;
};
const queue: Request[] = [];
let display: ((request: Request | null) => void) | undefined;
function request(message: string, value?: string) {
  return new Promise<string | boolean | null>(resolve => {
    queue.push({
      message,
      value,
      resolve,
      focus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    });
    display?.(queue[0]);
  });
}
export async function confirmAction(message: string) {
  return (await request(message)) === true;
}
export async function askText(message: string, value = "") {
  const result = await request(message, value);
  return typeof result === "string" ? result : null;
}
export function LibraryDialogs() {
  const ar = useLocale().locale === "ar";
  const [current, setCurrent] = useState<Request | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    display = setCurrent;
    if (queue.length) setCurrent(queue[0]);
    return () => {
      display = undefined;
      for (const item of queue.splice(0)) item.resolve(null);
    };
  }, []);
  useEffect(() => {
    setText(current?.value ?? "");
  }, [current]);
  const finish = (result: string | boolean | null) => {
    const item = queue.shift();
    setCurrent(queue[0] ?? null);
    item?.resolve(result);
    if (!queue.length) requestAnimationFrame(() => item?.focus?.focus());
  };
  return (
    <Dialog
      open={Boolean(current)}
      onOpenChange={open => {
        if (!open) finish(null);
      }}
    >
      <DialogContent>
        <DialogTitle>{ar ? "راجع اختيارك" : "Review your choice"}</DialogTitle>
        <DialogDescription className="whitespace-pre-line break-words">
          {current?.message}
        </DialogDescription>
        <form
          onSubmit={event => {
            event.preventDefault();
            finish(current?.value === undefined ? true : text.trim());
          }}
        >
          {current?.value !== undefined && (
            <Input
              autoFocus
              aria-label={ar ? "الاسم" : "Name"}
              value={text}
              maxLength={160}
              onChange={e => setText(e.target.value)}
            />
          )}
          <div className="mt-4 flex gap-2">
            <Button
              type="submit"
              disabled={current?.value !== undefined && !text.trim()}
            >
              {ar ? "كمّل" : "Continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => finish(null)}
            >
              {ar ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
