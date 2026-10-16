// What the hero's core (living-board.ts) hands to its two views: the desktop List View
// (hero-list-view.ts) and the phone screens (hero-phone-view.ts). Each view is loaded only on the
// screens that show it, so a phone never downloads the desktop table and a desktop never the phone app.
import type { ListCustomer, ListLead, ListQuote, ListRep, QuickAddValues, DuplicateMatch } from '../lib/logic/lead-list';
import type { LeadStatus } from '../lib/logic/lead-pipeline';

export type ToastType = 'success' | 'info' | 'warning' | 'error';
/** The quote the visitor approves (the dataset's thread), passed in by HeroBoard.astro. */
export type Story = { leadId: string; quote: string; quoteId: string; customer: string; total: number; wo: string; inv: string; toast: string; due: string };
export type NewLeadValues = QuickAddValues & { projectType?: string; siteSurveyDate?: string; noteText?: string };

export interface HeroView {
  /** Redraw from the current records (the core has already run the app's automatic moves). */
  draw(opts?: { keepFocus?: boolean }): void;
  /** The visitor took over: stop anything running by itself. */
  stop?(): void;
}

export interface HeroApi {
  root: HTMLElement;
  hero: HTMLElement;
  today: string;
  reps: ListRep[];
  story: Story;
  reduce: MediaQueryList;
  desktop: MediaQueryList;
  /** New leads the idle demo may type in, in order (shared so a requeued one is not lost). */
  incoming: QuickAddValues[];
  leads(): ListLead[];
  quotes(): ListQuote[];
  customers(): ListCustomer[];
  getLead(id: string | null | undefined): ListLead | undefined;
  putLead(next: ListLead): void;
  /** `_createLeadRecord`: the next LD number, on the end of the list. */
  createLead(v: NewLeadValues): ListLead;
  /** `setLeadSurveyDate` (with the app's toast). */
  survey(id: string, iso: string): void;
  /** `updateLeadFollowUp` (no toast in the app). */
  followUp(id: string, iso: string): void;
  /** `addLeadNote`, stamped with the signed-in user and the time. */
  addNote(id: string, text: string): boolean;
  /** A stage change made by hand (`changeLeadStatus`), with its activity line read out. */
  setStage(id: string, to: LeadStatus): void;
  toast(msg: string, type?: ToastType): void;
  announce(msg: string): void;
  /** The app's yes / no question (desktop dialog). */
  askConfirm(o: { title?: string; body: string; yes: string; yesClass?: string; onYes: () => void }): void;
  /** `_dupGuardPrompt` (desktop dialog); `use` selects an existing lead. */
  askDuplicate(matches: DuplicateMatch[], proceed: () => void, use: (id: string) => void): void;
  /** Redraw every view on screen. */
  draw(opts?: { keepFocus?: boolean }): void;
  /** Any real interaction with the screen or the story. */
  userTouched(): void;
  /** Whether the visitor has already taken over (so a view loaded late starts paused). */
  wasTouched(): boolean;
  track(name: string, data?: Record<string, string | number | boolean>): void;
}
