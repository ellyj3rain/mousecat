export interface LoadToken {
  project: string;
  generation: number;
}

export interface ActionToken extends LoadToken {
  action: string;
  actionGeneration: number;
}

export function sameActionToken(left: ActionToken, right: ActionToken): boolean {
  return left.project === right.project
    && left.generation === right.generation
    && left.action === right.action
    && left.actionGeneration === right.actionGeneration;
}

/** Rejects late async previews after project changes or newer requests. */
export class PreviewCoordinator {
  private project = "";
  private generation = 0;
  private actionGenerations = new Map<string, number>();

  beginLoad(project: string): LoadToken {
    this.project = project;
    this.generation += 1;
    this.actionGenerations.clear();
    return { project, generation: this.generation };
  }

  acceptsLoad(token: LoadToken): boolean {
    return token.project === this.project && token.generation === this.generation;
  }

  beginAction(project: string, action: string): ActionToken {
    const actionGeneration = (this.actionGenerations.get(action) ?? 0) + 1;
    this.actionGenerations.set(action, actionGeneration);
    return { project, action, generation: this.generation, actionGeneration };
  }

  acceptsAction(token: ActionToken): boolean {
    return token.project === this.project
      && token.generation === this.generation
      && this.actionGenerations.get(token.action) === token.actionGeneration;
  }

  invalidate(): void {
    this.project = "";
    this.generation += 1;
    this.actionGenerations.clear();
  }
}
