import {useMemo,useState} from 'react';
import {useWorkspace} from '../data/workspace';
import {useOverlays} from '../state/overlays';
import {workObservatory} from '../../engine/work-observatory.mjs';
import {useUi} from '../state/ui';
import '../styles/work-observatory.css';

type Row = ReturnType<typeof workObservatory>['rows'][number];
export function WorkObservatory() {
 const workspace=useWorkspace();const ui=useUi();const {openDrawer}=useOverlays();
 const view=useMemo(()=>workObservatory(workspace.data,workspace.status),[workspace.data,workspace.status]);
 const [project,setProject]=useState('all');const [selected,setSelected]=useState<string|null>(null);
 const projects=[...new Map(view.rows.map((row:Row)=>[row.projectId,row.project])).entries()];
 const rows=view.rows.filter((row:Row)=>project==='all'||row.projectId===project);
 const focus=rows.find((row:Row)=>row.key===selected)||rows[0];
 const inspect=(row:Row)=>openDrawer({title:row.title,tag:row.observation,rows:[{k:'Project',v:row.project},{k:'Observation',v:row.observation},{k:'Producer',v:'Source declaration'},{k:'Owner',v:row.owner||'Not exposed'},{k:'Meaning',v:'Observation does not grant authority or complete the containing goal',prose:true}],raw:row.raw});
 const inspectProject=(row:Row)=>{const object=workspace.data?.objects.find(object=>object.id===row.projectId);if(object?.root&&object.observation.status==='observed'){ui.openProject(row.projectId);return;}openDrawer({title:row.project,tag:'Project context',rows:[{k:'Responsibility',v:object?.responsibility||'Not exposed'},{k:'Source',v:object?.root||'Aggregate or unconfigured source'},{k:'Authority',v:object?.authority||'Not exposed'}],raw:object});};
 if(!view.rows.length&&!view.coverage.length)return null;
 return <section className="work-observatory" aria-label="Work and continuity">
  <div className="workspace-section-head"><div><p className="workspace-eyebrow">Work and continuity</p><h2>Where the work stands.</h2></div><p>Keep the outcome in view, then open the evidence.</p></div>
  {projects.length>1&&<div className="work-scope" aria-label="Work by project"><button aria-pressed={project==='all'} onClick={()=>setProject('all')}>All projects</button>{projects.map(([id,title])=><button key={id} aria-pressed={project===id} onClick={()=>setProject(id)}>{title}</button>)}</div>}
  {!!rows.length&&<div className="work-observatory-body">
   <div className="work-index" aria-label="Observed work">{rows.map((row:Row)=><button key={row.key} aria-pressed={focus?.key===row.key} className="work-index-item" onClick={()=>setSelected(row.key)}><span className="work-index-project">{row.project}</span><span className="work-index-title">{row.title}</span><span className="work-index-meta"><span className={'work-standing '+(row.current?'current':'retained')}>{row.state}</span>{row.owner&&<span>{row.owner}</span>}</span></button>)}</div>
   {focus&&<article className="work-focus" aria-label="Selected work">
    <div className="work-focus-heading"><span className="work-origin">{focus.project} / {'Source work'}</span><span className={'work-standing '+(focus.current?'current':'retained')}>{focus.state}</span></div>
    <h3>{focus.title}</h3>{focus.summary&&<p className="work-summary">{focus.summary}</p>}
    <p className="work-context">{focus.owner||'Responsible identity is not exposed'} · {focus.observation}</p>
    {focus.kind==='source'&&!!focus.units?.length&&<div className="work-units">{focus.units.map((unit:any)=><div key={unit.id} className="work-unit"><span><strong>{unit.target||unit.id}</strong><small>{unit.id}</small></span><span className="work-standing">{unit.status||'Standing not exposed'}</span></div>)}</div>}
    {!!focus.remaining.length&&<div className="work-remaining"><h4>Still part of the outcome</h4><ul>{focus.remaining.map((item:string,index:number)=><li key={index}>{item}</li>)}</ul></div>}
    <div className="work-focus-actions"><button onClick={()=>inspect(focus)}>Inspect source and evidence</button><button onClick={()=>inspectProject(focus)}>Project context</button></div>
    <details className="work-observation-details"><summary>Observation details</summary><p>{'This is a source declaration, not action authority or observed execution.'}</p><p>Identity: <code>{focus.source.workId}</code></p></details>
   </article>}
  </div>}
  {!rows.length&&<p className="work-observation-note">No work record is exposed by the selected sources. Missing observation does not erase ongoing responsibilities.</p>}
  <details className="work-source-coverage"><summary>Source coverage and retained direction</summary><p>Selected source declarations retain their own freshness, attribution and limits.</p>{view.coverage.map((item:any,index:number)=><p key={index}>{item.project}: {'source continuity'} · {item.status}</p>)}{view.directions.map((direction:any)=><button key={direction.projectId+direction.ideaId} onClick={()=>openDrawer({title:direction.title||direction.ideaId,tag:'Attributed direction',rows:[{k:'Project',v:direction.project},{k:'Author',v:direction.attribution?.author||'Not exposed'},{k:'Meaning',v:direction.proposition||'Not exposed',prose:true}],raw:direction})}>{direction.title||direction.ideaId}</button>)}</details>
 </section>;
}
