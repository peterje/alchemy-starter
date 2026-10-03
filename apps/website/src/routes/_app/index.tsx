import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/")({ component: NewChat });

/** An empty chat. Sending is not wired up yet, so the composer only shows where it will go. */
function NewChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
      <div className="w-full max-w-2xl">
        <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          What should we work on?
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Ask anything to start your first chat.
        </p>
        <form
          className="mt-8 rounded-2xl border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/30"
          onSubmit={(event) => event.preventDefault()}
        >
          <Textarea
            name="message"
            aria-label="Message"
            placeholder="Message the agent…"
            className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex justify-end">
            <Button type="submit" size="icon" aria-label="Send" disabled>
              <ArrowUpIcon />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
