/**
 * The narrative rot report.
 *
 * Layer 1 — the facts block — is deterministic and always shipped. It is
 * computed from the run's `health_checks` rows using the shared transition
 * definitions in `healthHistory.ts`.
 *
 * Layer 2 — the narrative — is optional, written by the owner's own LLM
 * (BYOK) over the facts block alone. If there is no key, or the call fails,
 * or the answer fails the grounding guard, Layer 1 ships alone. Layer 1 is
 * the product; Layer 2 is a voice on top of it.
 */

import { z } from "zod";
import { db } from "../data.js";
import { invokeLLM } from "../_core/llm.js";
import { aiConfigured } from "./aiTagging.js";
import { resolveAiModel } from "./aiModel.js";
import { classifyTransition, type HealthTransitionKind } from "./healthHistory.js";
import { publishFihristEvent } from "./liveEvents.js";
import type { HealthCheckRow } from "../db.js";
import {
  plainLanguageSentence,
  type CheckedHealthState,
} from "../../shared/healthLanguage.js";

export const DIGEST_SECTION_CAP = 6;
export const DIGEST_NARRATIVE_WORD_CAP = 120;

export type DigestItem = {
  bookmarkId: number;
  title: string;
  host: string;
  url: string;
  status: CheckedHealthState;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  failureClass?: string | null; moveClass?: string | null;
  archiveUrl?: string | null; archiveCheckedAt?: string | null;
  checksDisabled?: boolean; persistentFailure?: boolean;
  /** The plain-language sentence for this state — never a raw code alone. */
  sentence: { ar: string; en: string };
  /** When the state described by this item began. */
  since: string;
  /** Consecutive checks in this state. */
  streak: number;
};

export type DigestItems = {
  newlyBroken: DigestItem[];
  recovered: DigestItem[];
  newlySuspicious: DigestItem[];
  stillBroken: DigestItem[];
  redirected: DigestItem[];
};

export type DigestFacts = {
  runId: number;
  trigger: "weekly" | "manual" | "single";
  runStartedAt: string | null;
  runCompletedAt: string | null;
  checked: number;
  skipped: number;
  counts: {
    newlyBroken: number;
    recovered: number;
    newlySuspicious: number;
    stillBroken: number;
    redirected: number;
    dismissed: number;
  };
  items: DigestItems;
  generatedAt: string;
};

export type DigestRun = {
  id: number;
  trigger: "weekly" | "manual" | "single";
  startedAt: Date | null;
  completedAt: Date | null;
  total: number;
  checked: number;
};

function bookmarkTitle(title: string | null, host: string) {
  return title?.trim() || host;
}

/**
 * Compute the facts block for a run.
 *
 * For every bookmark the run touched, the run's last check is compared with
 * the last check recorded before the run. The transition definitions are the
 * only source of the sections.
 */
export async function computeRunFacts(
  userId: number,
  run: DigestRun
): Promise<DigestFacts> {
  const runChecks = await db.listHealthChecksForRun(userId, run.id);
  const bookmarkIds = Array.from(new Set(runChecks.map(check => check.bookmarkId)));
  const runStart = run.startedAt ?? new Date(0);

  const lastRunCheckByBookmark = new Map<number, HealthCheckRow>();
  for (const check of runChecks) {
    const current = lastRunCheckByBookmark.get(check.bookmarkId);
    if (
      !current ||
      check.checkedAt.getTime() > current.checkedAt.getTime() ||
      (check.checkedAt.getTime() === current.checkedAt.getTime() && check.id > current.id)
    ) {
      lastRunCheckByBookmark.set(check.bookmarkId, check);
    }
  }

  // The "previous" each delta is measured against: the last check recorded
  // before this run, found in the database — not by loading the whole history.
  const previousChecks = await db.latestChecksBefore(userId, bookmarkIds, runStart);

  const dismissals = await db.getHealthAlertDismissals(userId, bookmarkIds);
  const bookmarks = await db.listBookmarkTitleIndex(userId);
  const bookmarkById = new Map(bookmarks.map(bookmark => [bookmark.id, bookmark]));

  const items: DigestItems = {
    newlyBroken: [],
    recovered: [],
    newlySuspicious: [],
    stillBroken: [],
    redirected: [],
  };
  let dismissed = 0;

  for (const [bookmarkId, current] of Array.from(lastRunCheckByBookmark.entries())) {
    const previousStatus = (previousChecks.get(bookmarkId)?.status ??
      null) as CheckedHealthState | null;

    const transition = classifyTransition(previousStatus, current.status);

    // Which section does this link belong to? A link whose status did not
    // change and is not a redirect is not part of the report at all.
    const transitionSection: keyof DigestItems | null =
      transition === "newly_broken"
        ? "newlyBroken"
        : transition === "still_broken"
          ? "stillBroken"
          : transition === "recovered"
            ? "recovered"
            : transition === "newly_suspicious"
              ? "newlySuspicious"
              : null;
    const isRedirected = current.status === "redirected" && current.moveClass !== "canonical";
    if (!transitionSection && !isRedirected) continue;

    // The current spell: how long the link has been in this state. A state
    // that changed in this run started here; only a state that carried over
    // needs the bookmark's own history.
    const carriedOver =
      transition === "still_broken" || (transition === null && isRedirected);
    let streak = 1;
    let since = current.checkedAt;
    if (carriedOver) {
      const history = await db.listChecksForBookmark(userId, bookmarkId);
      const currentIndex = history.findIndex(check => check.id === current.id);
      if (currentIndex !== -1) {
        streak = 0;
        for (let index = currentIndex; index >= 0; index -= 1) {
          if (history[index].status !== current.status) break;
          streak += 1;
          since = history[index].checkedAt;
        }
      }
      const rollup=await db.getHealthRollup(userId,bookmarkId);
      if (rollup?.lastPrunedStatus===current.status &&
          rollup.statusSince?.getTime()===since.getTime()) {
        streak += rollup.openStreak;
      }
    }

    const bookmark = bookmarkById.get(bookmarkId);
    const item: DigestItem = {
      bookmarkId,
      title: bookmarkTitle(bookmark?.title ?? null, bookmark?.host ?? ""),
      host: bookmark?.host ?? "",
      url: bookmark?.url ?? "",
      status: current.status,
      httpStatus: current.httpStatus,
      finalUrl: current.finalUrl,
      error: current.error,
      failureClass:current.failureClass??null,moveClass:current.moveClass??null,
      archiveUrl:bookmark?.archiveUrl??null,
      archiveCheckedAt:bookmark?.archiveCheckedAt?.toISOString()??null,
      checksDisabled:bookmark?.checksDisabled??false,
      persistentFailure:bookmark?.persistentFailure??false,
      sentence: {
        ar: plainLanguageSentence(
          { status: current.status, httpStatus: current.httpStatus, error: current.error,
          failureClass: current.failureClass, moveClass: current.moveClass,
          persistentFailure:bookmark?.persistentFailure,checksDisabled:bookmark?.checksDisabled,
          archiveUrl:bookmark?.archiveUrl },
          "ar"
        ),
        en: plainLanguageSentence(
          { status: current.status, httpStatus: current.httpStatus, error: current.error,
          failureClass: current.failureClass, moveClass: current.moveClass,
          persistentFailure:bookmark?.persistentFailure,checksDisabled:bookmark?.checksDisabled,
          archiveUrl:bookmark?.archiveUrl },
          "en"
        ),
      },
      since: since.toISOString(),
      streak,
    };

    // A dismissed link stays hidden until its next status transition.
    const dismissedAt = dismissals.get(bookmarkId);
    if (dismissedAt && dismissedAt.getTime() >= since.getTime()) {
      dismissed += 1;
      continue;
    }

    if (transitionSection) items[transitionSection].push(item);
    if (isRedirected) items.redirected.push(item);
  }

  const sortBySince = (list: DigestItem[]) =>
    list.sort((left, right) => right.since.localeCompare(left.since));

  sortBySince(items.newlyBroken);
  sortBySince(items.recovered);
  sortBySince(items.newlySuspicious);
  sortBySince(items.stillBroken);
  sortBySince(items.redirected);

  return {
    runId: run.id,
    trigger: run.trigger,
    runStartedAt: run.startedAt?.toISOString() ?? null,
    runCompletedAt: run.completedAt?.toISOString() ?? null,
    checked: lastRunCheckByBookmark.size,
    skipped: Math.max(run.total - lastRunCheckByBookmark.size, 0),
    counts: {
      newlyBroken: items.newlyBroken.length,
      recovered: items.recovered.length,
      newlySuspicious: items.newlySuspicious.length,
      stillBroken: items.stillBroken.length,
      redirected: items.redirected.length,
      dismissed,
    },
    items,
    generatedAt: new Date().toISOString(),
  };
}

/** True when nothing changed — the digest is one line and no LLM is called. */
export function factsHaveNoChanges(facts: DigestFacts) {
  return (
    facts.counts.newlyBroken === 0 &&
    facts.counts.recovered === 0 &&
    facts.counts.newlySuspicious === 0 &&
    facts.counts.stillBroken === 0 &&
    facts.counts.redirected === 0
  );
}

// ---------------------------------------------------------------------------
// Layer 2 — the narrative, grounded in the facts block.
// ---------------------------------------------------------------------------

const narrativeSchema = z.object({
  narrative: z.string(),
  itemIds: z.array(z.number().int()).max(60),
});

/** Words that assert a link is dead. */
const DEATH_WORDS = [
  "dead",
  "gone",
  "deleted",
  "closed",
  "shutdown",
  "shut",
  "broken",
  "404",
  "410",
  "مات",
  "ميت",
  "ماتت",
  "مكسور",
  "انكسر",
  "اتشالت",
  "محذوف",
  "مسح",
  "مقفول",
  "طير",
];

/** Words that assert the site itself is unreachable — the DNS/connection cause. */
const DNS_WORDS = ["not responding", "مش بيرد", "قفل", "dns", "دومين"];

/** Words that assert the page was deliberately removed — the 404/410 cause. */
const REMOVED_WORDS = ["removed", "اتشالت", "gone", "deleted", "محذوف", "404", "410"];

function normalizeForMatch(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\w\s\u0590-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words that would assert a link is dead. */
function deathTokensIn(sentence: string) {
  const normalized = normalizeForMatch(sentence);
  return DEATH_WORDS.filter(token => normalized.includes(token));
}

function causeTokensIn(sentence: string) {
  const normalized = normalizeForMatch(sentence);
  return {
    dns: DNS_WORDS.filter(token => normalized.includes(token)),
    removed: REMOVED_WORDS.filter(token => normalized.includes(token)),
  };
}

/**
 * Tokens this item's recorded state forbids.
 *
 * A broken link may only be described with the cause the server actually
 * recorded: a 404/410 may be "removed", a DNS failure may be "not
 * responding", never the other. Anything alive may not be described as dead.
 */
function forbiddenTokensFor(item: DigestItem) {
  if (item.status === "broken") {
    if (item.httpStatus === null) return REMOVED_WORDS;
    if (item.httpStatus === 404 || item.httpStatus === 410) return DNS_WORDS;
    return [...DNS_WORDS, ...REMOVED_WORDS];
  }
  if (item.status === "healthy") {
    return [...DEATH_WORDS, ...DNS_WORDS, ...REMOVED_WORDS];
  }
  // needs_review and redirected are alive: no death claims, no cause claims.
  return [...DEATH_WORDS, ...REMOVED_WORDS];
}

const MARKDOWN_MARKERS = ["**", "##", "```", "\n- ", "\n* ", "\n# ", "](", "```"];

/** The generic word for a link — a narrative may only use it for a marked link. */
const LINK_NOUNS = ["link", "رابط", "روابط", "لينك"];

/** ASCII, Arabic-Indic and Extended Arabic-Indic digits. */
const DIGIT_PATTERN = /[0-9\u0660-\u0669\u06F0-\u06F9]/;

export type NarrativeRejection = { ok: false; reason: string };
export type NarrativeAcceptance = { ok: true; narrative: string };
export type NarrativeVerdict = NarrativeAcceptance | NarrativeRejection;

/**
 * The grounding guard.
 *
 * The narrative may only talk about links in the facts block, may not assert
 * a cause the server did not record, and may never call a `needs_review` link
 * dead. Anything else is rejected and Layer 1 ships alone.
 */
export function validateNarrative(params: {
  narrative: string;
  itemIds: number[];
  facts: DigestFacts;
  libraryTitles: Array<{ id: number; title: string | null; host: string }>;
}): NarrativeVerdict {
  const { narrative, itemIds, facts, libraryTitles } = params;

  const itemsById = new Map<number, DigestItem>();
  for (const list of Object.values(facts.items)) {
    for (const item of list) itemsById.set(item.bookmarkId, item);
  }

  // Every link the narrative claims to mention must exist in the facts block.
  for (const id of itemIds) {
    if (!itemsById.has(id)) {
      return { ok: false, reason: `The narrative referenced a link that is not in this run (${id}).` };
    }
  }

  for (const marker of MARKDOWN_MARKERS) {
    if (narrative.includes(marker)) {
      return { ok: false, reason: "The narrative contained markup." };
    }
  }

  // Resolve [[id]] markers; every one must be a facts item.
  const markerIds: number[] = [];
  const withMarkers = narrative.replace(/\[\[(\d+)\]\]/g, (_match, id: string) => {
    const numeric = Number(id);
    markerIds.push(numeric);
    return `[[${numeric}]]`;
  });
  for (const id of markerIds) {
    if (!itemsById.has(id)) {
      return { ok: false, reason: `The narrative referenced a link that is not in this run (${id}).` };
    }
  }

  // No link outside the facts block may be named.
  const factsTitles = new Set(
    Object.values(facts.items)
      .flat()
      .map(item => item.title)
      .filter(title => title.length >= 4)
  );
  for (const entry of libraryTitles) {
    if (!entry.title || entry.title.length < 4) continue;
    if (factsTitles.has(entry.title)) continue;
    if (withMarkers.includes(entry.title)) {
      return {
        ok: false,
        reason: `The narrative named "${entry.title}", which is not part of this run.`,
      };
    }
  }

  // Split into sentences and check each one against the links it mentions.
  const sentences = withMarkers
    .split(/(?<=[.!؟?،؛\n])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const hasMarker = /\[\[\d+\]\]/.test(sentence);
    // A link may only be referred to through a marked id. Naming one without
    // a marker is either a count ("3 links broke") or an invented link.
    // Arabic-Indic digits count as a count too, not as a link reference.
    if (!hasMarker && !DIGIT_PATTERN.test(sentence)) {
      const namedLink = LINK_NOUNS.some(noun => sentence.includes(noun));
      if (namedLink) {
        return {
          ok: false,
          reason: "The narrative referred to a link that is not one of this run's links.",
        };
      }
    }

    const referenced: DigestItem[] = [];
    const addReference = (item: DigestItem | undefined) => {
      if (item && referenced.indexOf(item) === -1) referenced.push(item);
    };
    for (const id of markerIds) {
      if (sentence.includes(`[[${id}]]`)) addReference(itemsById.get(id));
    }
    itemsById.forEach(item => {
      if (item.title.length >= 4 && sentence.includes(item.title)) addReference(item);
    });

    const deathWords = deathTokensIn(sentence);
    for (const item of referenced) {
      const forbidden = forbiddenTokensFor(item);
      const offending = deathWords.filter(word => forbidden.indexOf(word) !== -1);
      if (offending.length) {
        return {
          ok: false,
          reason: `The narrative described "${item.title}" in a way the recorded status does not support (${offending.join(", ")}).`,
        };
      }
    }

    // A sentence that asserts a cause must match the cause that was recorded.
    const causes = causeTokensIn(sentence);
    if (causes.dns.length && causes.removed.length) {
      return {
        ok: false,
        reason: "The narrative asserted two conflicting causes at once.",
      };
    }
  }

  // Replace the markers with the real titles.
  const resolved = withMarkers.replace(/\[\[(\d+)\]\]/g, (_match, id: string) => {
    const item = itemsById.get(Number(id));
    return item?.title ?? "this link";
  });

  // Cap the length without inventing anything: keep whole sentences.
  const words = resolved.split(/\s+/).filter(Boolean);
  if (words.length > DIGEST_NARRATIVE_WORD_CAP) {
    let kept = "";
    for (const sentence of sentences) {
      const candidate = kept ? `${kept} ${sentence}` : sentence;
      if (candidate.split(/\s+/).filter(Boolean).length > DIGEST_NARRATIVE_WORD_CAP) break;
      kept = candidate;
    }
    return { ok: true, narrative: kept.trim() };
  }

  return { ok: true, narrative: resolved.trim() };
}

/** The facts block as the LLM sees it: aggregated counts and capped lists. */
export function buildNarrativeInput(facts: DigestFacts) {
  const compact = (item: DigestItem) => ({
    id: item.bookmarkId,
    title: item.title,
    status: item.status,
    httpStatus: item.httpStatus,
    sentence: item.sentence.ar,
    streak: item.streak,
  });
  return {
    checked: facts.checked,
    skipped: facts.skipped,
    counts: {
      newlyBroken: facts.counts.newlyBroken,
      recovered: facts.counts.recovered,
      newlySuspicious: facts.counts.newlySuspicious,
      stillBroken: facts.counts.stillBroken,
      redirected: facts.counts.redirected,
    },
    sections: {
      newlyBroken: facts.items.newlyBroken.slice(0, DIGEST_SECTION_CAP).map(compact),
      recovered: facts.items.recovered.slice(0, DIGEST_SECTION_CAP).map(compact),
      newlySuspicious: facts.items.newlySuspicious.slice(0, DIGEST_SECTION_CAP).map(compact),
      stillBroken: facts.items.stillBroken.slice(0, DIGEST_SECTION_CAP).map(compact),
      redirected: facts.items.redirected.slice(0, DIGEST_SECTION_CAP).map(compact),
    },
  };
}

const NARRATIVE_SYSTEM_PROMPT = [
  "You write the librarian's note for a personal link library. Write in calm, plain Arabic.",
  "Rules:",
  "- Talk ONLY about the links in the FACTS block. Never mention a link that is not there.",
  "- A link with status \"broken\" is dead. A link with status \"needs_review\" is NOT dead — the check was inconclusive.",
  "- Use the given sentence for each link you mention. Never invent a reason a link failed.",
  "- Refer to a link as [[id]] — the app replaces it with the link's title.",
  "- At most 120 words. Plain prose only: no markdown, no bullet points, no headings.",
  "- Tone: a calm librarian's note, never alarming. Short sentences.",
].join("\n");

/** Rough token estimate for the facts payload — surfaced before generation. */
export function estimatePromptTokens(payload: unknown) {
  const characters = JSON.stringify(payload).length;
  return Math.max(1, Math.ceil(characters / 4));
}

export type NarrativeResult = {
  narrative: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

/**
 * Write the narrative over the facts block. Exactly one attempt — no retry
 * loop. Any failure returns null and Layer 1 ships alone.
 */
export async function writeDigestNarrative(
  userId: number,
  facts: DigestFacts
): Promise<NarrativeResult | null> {
  if (!aiConfigured()) return null;
  if (factsHaveNoChanges(facts)) return null;

  const payload = buildNarrativeInput(facts);
  let response;
  try {
    response = await invokeLLM({
      model: await resolveAiModel(),
      maxTokens: 500,
      outputSchema: {
        name: "fihrist_rot_digest",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            narrative: { type: "string" },
            itemIds: { type: "array", items: { type: "number" } },
          },
          required: ["narrative", "itemIds"],
        },
      },
      messages: [
        { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `FACTS:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });
  } catch (error) {
    console.error("[Fihrist] Rot digest narrative failed (non-fatal)", error);
    return null;
  }

  const raw = response.choices[0]?.message.content;
  const text = typeof raw === "string" ? raw : "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[Fihrist] Rot digest narrative was not valid JSON — shipping the facts alone");
    return null;
  }
  const validated = narrativeSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[Fihrist] Rot digest narrative was malformed — shipping the facts alone");
    return null;
  }

  const libraryTitles = await db.listBookmarkTitleIndex(userId);
  const verdict = validateNarrative({
    narrative: validated.data.narrative,
    itemIds: validated.data.itemIds,
    facts,
    libraryTitles,
  });
  if (!verdict.ok) {
    console.error(`[Fihrist] Rot digest narrative rejected: ${verdict.reason}`);
    return null;
  }

  return {
    narrative: verdict.narrative,
    model: response.model ?? "unknown",
    promptTokens: response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
  };
}

/**
 * Generate the digest for a completed run.
 *
 * Layer 1 (the facts block) is written first and always ships. Layer 2 is
 * attempted exactly once, only when a BYOK key is configured, and a failure
 * leaves the digest as a facts-only report.
 */
export async function generateRotDigest(userId: number, run: DigestRun) {
  const existing = await db.getRotDigestByRun(userId, run.id);
  if (existing) return existing;

  const facts = await computeRunFacts(userId, run);
  const estimatedPromptTokens = estimatePromptTokens(buildNarrativeInput(facts));

  const digestId = await db.insertRotDigest({
    userId,
    runId: run.id,
    facts: JSON.stringify(facts),
    narrative: null,
    narrativeStatus: "none",
    model: null,
    promptTokens: null,
    completionTokens: null,
    estimatedPromptTokens,
  });

  let narrativeStatus: "none" | "ok" | "failed" = "none";
  let narrative: string | null = null;
  let model: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  if (aiConfigured() && !factsHaveNoChanges(facts)) {
    const result = await writeDigestNarrative(userId, facts);
    if (result) {
      narrativeStatus = "ok";
      narrative = result.narrative;
      model = result.model;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
    } else {
      narrativeStatus = "failed";
    }
  }

  await db.updateRotDigest(userId, digestId, {
    narrative,
    narrativeStatus,
    model,
    promptTokens,
    completionTokens,
  });
  publishFihristEvent({ type: "digest.updated", userId });
  return db.getRotDigestByRun(userId, run.id);
}

/**
 * The run-completion hook. Single checks never produce a digest — only a
 * completed full drain does.
 */
export async function onHealthRunCompleted(userId: number, run: DigestRun) {
  if (run.trigger === "single") return null;
  const digest=await generateRotDigest(userId,run);
  if(run.trigger==="weekly") {
    // After digest facts are fixed, compact the old detailed rows into rollups.
    const {maintainHealthHistory}=await import("./healthRetention.js");
    await maintainHealthHistory(userId);
    const first=await db.listBookmarkIds(userId,0,1);
    if(first[0] && !(await db.hasActiveBookmarkJob(userId,first[0].id,"shelf_refresh"))) {
      await db.createBookmarkJob(userId,first[0].id,"shelf_refresh",run.id);
    }
  }
  return digest;
}