export type ActivitySelection = { sourceId: string; sourceRevision: string; projectRef: string; recipientRef: string };
export type ActivityEvent = { id: string; type: string; at: string; projectRef: string; data: Readonly<Record<string, string>> };
export type ActivityMeaning = 'assignment' | 'handoff' | 'dispatch' | 'execution' | 'acceptance' | 'status' | 'ignore';
export type ActivityAuthority = {
  selection: ActivitySelection;
  current(selection: Readonly<ActivitySelection>): boolean;
  verify(selection: Readonly<ActivitySelection>, event: Readonly<ActivityEvent>): { allowed: true; selection: Readonly<ActivitySelection>; event: Readonly<ActivityEvent>; meaning: ActivityMeaning } | null;
};
export type ReceiveResult = { status: 'held'; reason: string; page?: unknown } | { status: 'received-into-history'; added: number; page: unknown };
export function receiveProjectActivity(args: { page: unknown; authority?: ActivityAuthority; history: any[]; commit(next: any[]): boolean }): ReceiveResult;
export function visibleProjectHistory<T>(history: T[], authority?: ActivityAuthority): T[];
