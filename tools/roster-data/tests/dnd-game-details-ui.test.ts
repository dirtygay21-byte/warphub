import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../../..");
const card = readFileSync(join(root, "client/src/components/pages/Home/Dnd/DndSection.tsx"), "utf8");
const modal = readFileSync(join(root, "client/src/components/pages/Home/Dnd/DndGameDetailsModal.tsx"), "utf8");

test("D&D description opens from both the preview and an explicit action on every card", () => {
  assert.ok(card.includes("aria-label={`Открыть полное описание игры"));
  assert.ok(card.includes("Читать полностью"));
  assert.ok(card.includes("detailsOpen && game.description"));
  assert.ok(card.includes("<DndGameDetailsModal"));
  assert.ok(card.includes("<DndGameCard game={game} />"), "join form must keep the same details-capable card");
  assert.ok(card.includes("<AnimatePresence>"));
});

test("D&D details overlay preserves the full text, image and booking metadata", () => {
  assert.ok(modal.includes("whitespace-pre-wrap"));
  assert.ok(modal.includes("src={imageUrl}"));
  assert.ok(modal.includes("{dateLabel}"));
  assert.ok(modal.includes("{timeLabel}"));
  assert.ok(modal.includes("{availabilityLabel}"));
  assert.ok(modal.includes("role=\"dialog\""));
  assert.ok(modal.includes("aria-modal=\"true\""));
  assert.ok(modal.includes("aria-labelledby={titleId}"));
  assert.ok(modal.includes("aria-describedby={descriptionId}"));
});

test("D&D details overlay handles focus, keyboard, scroll locking and animated exit", () => {
  assert.ok(modal.includes("event.key === \"Escape\""));
  assert.ok(modal.includes("event.key !== \"Tab\""));
  assert.ok(modal.includes("previousFocusRef.current?.focus"));
  assert.ok(modal.includes("document.body.style.overflow = \"hidden\""));
  assert.ok(modal.includes("document.body.style.overflow = previousOverflow"));
  assert.ok(modal.includes("useDialogExit"));
  assert.ok(modal.includes("ds-leaving pointer-events-none"));
});
