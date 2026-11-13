// Presentation of selected source declarations; no transition or action authority.
const text = value => typeof value === 'string' && value.trim() ? value : null;
const list = value => Array.isArray(value) ? value : [];
const ageIsCurrent = (at, now) => { const age=now-Date.parse(at); return Number.isFinite(age) && age>=-5000 && age<45000; };

export function workObservatory(workspace, status, now=Date.now()) {
  const objects=list(workspace?.objects);
  const rows=[], coverage=[];
  for(const object of objects) {
    const continuity=object.continuity;
    if(!continuity || continuity.status==='unconfigured')continue;
    coverage.push({projectId:object.id,project:object.label,kind:'source',status:continuity.status,sources:continuity.sources,issues:continuity.issues});
    const selected=new Set(list(continuity.heads).flatMap(head=>list(head.recordIds)));
    for(const record of list(continuity.records).filter(record=>selected.has(record.recordId))) {
      const ambiguous=list(continuity.heads).some(head=>head.workId===record.workId && head.ambiguous);
      const current=status==='live' && continuity.status==='observed' && !record.stale && !ambiguous && ageIsCurrent(continuity.observedAt,now);
      rows.push({key:`${object.id}:source:${record.recordId}`,kind:'source',projectId:object.id,project:object.label,
        title:text(record.outcome)||record.workId,owner:text(record.owner?.role),ownerSession:text(record.owner?.sessionId),current,
        state:current?'Declared work':'Last observed',observation:ambiguous?'Conflicting source revisions':current?'Current source declaration':'Retained source declaration',
        summary:null,remaining:list(record.remaining),units:list(record.units),directions:list(record.directions),
        source:{workId:record.workId,recordId:record.recordId,revision:record.revision,acceptedRevision:record.acceptedRevision,observedAt:continuity.observedAt,sources:continuity.sources},raw:{record,context:continuity},
      });
    }
  }
  return {rows,coverage,directions:objects.flatMap(object=>list(object.continuity?.directives).map(direction=>({projectId:object.id,project:object.label,...direction}))),automaticExecution:false,authorityGranted:false};
}
